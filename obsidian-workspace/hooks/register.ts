import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'
import { bounded, MAX_CHARS } from './bounds.ts'
import { configOf } from './config.ts'
import { isBadCardName, dashboardPath, taskFolder } from './argv.ts'
import { baseQueryArgv, cardPathArgv, viewsArgv } from './base-argv.ts'
import type { Scope } from './base-argv.ts'
import { baseQueryOutput, viewsOutput, readOutput, OBSIDIAN_TIMEOUT_MS } from './cli-output.ts'
import type { Run } from './cli-output.ts'
import { cardName, listRows, resolveArgument, rowNamed, rowSlug, rowsOutside } from './rows.ts'
import { COUNT_VIEW, missingViewHint, missingViewText } from './counts.ts'
import { listGroups, listItems } from './list.ts'
import { listChildren, listHints } from './list-view.ts'
import type { ListHandlers } from './list-view.ts'
import { acLabel, headerOf, relationsOf } from './card.ts'
import { vizManifestPath, vizInstallPath, renderTarget, renderArgv, renderOutcome, RENDER_TIMEOUT_MS, isLoopbackUrl, tailnetUrl, SERVE_STATUS_ARGV, SERVE_TIMEOUT_MS } from './viz.ts'
import { splitFences, termaidHeaderAllowed, diagramOutcome, TERMAID_ARGV, TERMAID_TIMEOUT_MS } from './mermaid.ts'
import type { Segment } from './mermaid.ts'
import { BACK_KEY, QUERY_KEY, arrowMove, backTarget, closeGoesBack, nextRing, reorderTarget, submitTarget } from './ring.ts'
import { LIST_START, LOADING, RING_START } from './state.ts'
import { ACCENT, ERROR, INACTIVE, SUBTLE, priorityColor, statusColor } from './style.ts'
import { fitWidth } from './width.ts'
import type { ObwBound, ObwBrowser, ObwCard, ObwLine, ObwList, ObwPane } from '../types/index.d.ts'
import { bindingAction, bindingOf, bindingPath, sameBinding, statusChanges } from './bind.ts'
import type { Binding } from './bind.ts'

// The scan that checks `update` and `read` follows an atom only when it is made in the file that uses it.
// Bump the shape tag when ObwPane changes meaning: a reload then declines what the old code wrote.
export const pane = atom({ plugin: 'obw', key: 'pane' } as const, LOADING, { shape: 'pane-2' })
export const list = atom({ plugin: 'obw', key: 'list' } as const, LIST_START)
export const ring = atom({ plugin: 'obw', key: 'ring' } as const, RING_START)

// $.state values stop at 4 MiB, and a write over it skips the whole command: what the pane keeps from the vault is cut well short of that.
const MAX_LABEL = 200
const MAX_STORED_BODY = 1_000_000

const PANE_ID = 'obw-issue'
const PANE = { id: PANE_ID, title: 'obw issue', focus: true, closeOnEscape: true, holdToasts: true } as const

type Line = ObwLine
type Shown = Extract<ObwCard, { kind: 'shown' }>

type Stored = Omit<ObwBound, 'card'>

// The session's binding as loaded from its file; null while the session has none.
export const binding = atom({ plugin: 'obw', key: 'binding' } as const, null as ObwBound | null)

async function runProcess($: any, argv: string[], timeoutMs = OBSIDIAN_TIMEOUT_MS, stdin?: string): Promise<Run> {
  try {
    const result = await $.process.run(argv, { ...(stdin === undefined ? {} : { stdin }), timeoutMs })
    return { kind: 'exited', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
  } catch {
    return { kind: 'rejected' }
  }
}

// A CLI call can settle after a newer /issue, pick, card open or back step: each one numbers its own request,
// and a write from an older one is dropped inside the compare-and-set.
async function begin($: any, change: (state: ObwPane) => ObwPane): Promise<number> {
  const written = await update($, pane, (state) => ({ ...change(state), request: state.request + 1 }))
  return written.request
}

async function put($: any, request: number, change: (state: ObwPane) => ObwPane): Promise<boolean> {
  const written = await update($, pane, (state) => (state.request === request ? change(state) : state))
  return written.request === request
}

// A refused focus (the pane does not hold the keys, a key not drawn) leaves the ring where it is.
async function focus($: any, key: string): Promise<boolean> {
  try {
    const moved = await $.ui.focus({ requestId: PANE_ID, key })
    return !moved?.deny
  } catch {
    return false
  }
}

function showMessage($: any, request: number, message: string) {
  return put($, request, (state) => ({ ...LOADING, request: state.request, loading: false, message: { kind: 'error', text: message } }))
}

// Any fault while looking for viz only leaves viz unfound; the card still draws.
async function findViz($: any): Promise<string | null> {
  try {
    const path = vizManifestPath(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME'))
    return path ? vizInstallPath(await $.fs.read(path)) : null
  } catch {
    return null
  }
}

// What a card step leaves behind: the trail, and the card to read, or none when the list is back.
type Step = { trail: string[]; path: string | null }

// Where the ring goes after a step, from the trail before it and the keys the list draws after it.
type RingAfter = (before: string[], keys: string[]) => string | null

// The step is taken from the trail inside the write, so two steps in a row each start from what the one before left.
// The trail change and the new request are one write, so no drawing shows the old card under the new trail.
async function show($: any, step: (before: string[]) => Step, ringAfter: RingAfter | null = null) {
  const { scope } = await read($, pane)
  if (!scope) return
  let before: string[] = []
  let taken: Step = { trail: [], path: null }
  const request = await begin($, (state) => {
    before = state.trail
    taken = step(state.trail)
    const built = taken.path === null ? null : cardPathArgv(scope, taken.path)
    const card: ObwCard | null =
      taken.path === null ? null : built && 'argv' in built ? { kind: 'loading', path: taken.path } : { kind: 'error', message: `"${taken.path}" is not a card path.` }
    return { ...state, trail: taken.trail, selected: taken.path, card }
  })
  const { path } = taken
  if (ringAfter) {
    const target = ringAfter(before, path === null ? (await drawnItems($)).keys : [])
    if (target) void focus($, target)
  }
  if (path === null) return
  const built = cardPathArgv(scope, path)
  if (!('argv' in built)) return
  const settle = (card: ObwCard) => put($, request, (state) => ({ ...state, card }))
  const output = readOutput(await runProcess($, built.argv))
  if (output.kind === 'error') return settle({ kind: 'error', message: output.message })
  const vizRoot = await findViz($)
  const segments = splitFences(bounded(output.body).text)
  await settle({
    kind: 'shown',
    path,
    header: headerOf(output.frontmatter),
    body: output.body.slice(0, MAX_STORED_BODY),
    segments,
    relations: relationsOf(output.frontmatter),
    vizRoot,
    browser: null,
    diagrams: segments.map(() => null),
    bindLine: null,
  })
  // termaid never holds /issue: an offline uvx can take seconds, and the card is already drawn.
  void drawDiagrams($, request, segments).catch(() => {})
}

// One run at a time: a rejected run means uvx fails for every block, and a superseded read never draws.
async function drawDiagrams($: any, request: number, segments: Segment[]) {
  for (const [index, segment] of segments.entries()) {
    if (segment.kind !== 'mermaid' || !termaidHeaderAllowed(segment.source) || (await read($, pane)).request !== request) continue
    const run = await runProcess($, TERMAID_ARGV, TERMAID_TIMEOUT_MS, segment.source)
    if (run.kind === 'rejected') return
    const diagram = diagramOutcome(run)
    if (diagram !== null) await patchShown($, request, (card) => ({ ...card, diagrams: card.diagrams.map((drawn, at) => (at === index ? diagram : drawn)) }))
  }
}

// A diagram or press result writes only under the card read it came from: a newer read, even of the same card, drops it.
function patchShown($: any, request: number, patch: (card: Shown) => Shown) {
  return put($, request, (state) => (state.card?.kind === 'shown' ? { ...state, card: patch(state.card) } : state))
}

function showBrowser($: any, request: number, browser: ObwBrowser) {
  return patchShown($, request, (card) => ({ ...card, browser }))
}

async function openInBrowser($: any) {
  const { card, scope, request } = await read($, pane)
  if (card?.kind !== 'shown' || !card.vizRoot || !scope) return
  const target = renderTarget(rowSlug(scope.project, card.path))
  await showBrowser($, request, { kind: 'rendering' })
  try {
    await $.fs.write(target.file, card.body)
  } catch (error) {
    await showBrowser($, request, { kind: 'error', message: `Could not write ${target.file}: ${reasonOf(error)}` })
    return
  }
  const outcome = renderOutcome(await runProcess($, renderArgv(card.vizRoot, target), RENDER_TIMEOUT_MS))
  await showBrowser($, request, outcome)
  if (outcome.kind !== 'opened' || !outcome.url || !isLoopbackUrl(outcome.url)) return
  const status = await runProcess($, SERVE_STATUS_ARGV, SERVE_TIMEOUT_MS)
  const tailnet = status.kind === 'exited' && status.exitCode === 0 ? tailnetUrl(outcome.url, status.stdout) : null
  if (tailnet) await showBrowser($, request, { ...outcome, tailnet })
}

async function bindShown($: any) {
  const { card, scope, request } = await read($, pane)
  if (card?.kind !== 'shown' || !scope) return
  const outcome = await writeBinding($, { cardPath: card.path, vault: scope.vault, project: scope.project })
  await patchShown($, request, (card) => ({ ...card, bindLine: outcome.ok ? null : { kind: 'error', text: `Could not bind: ${outcome.reason}` } }))
}

async function unbindShown($: any) {
  const { request } = await read($, pane)
  const outcome = await removeBinding($)
  await patchShown($, request, (card) => ({ ...card, bindLine: outcome.ok ? null : { kind: 'error', text: `Could not unbind: ${outcome.reason}` } }))
}

// A block without a drawn diagram stays inside the markdown around it, so a pending or failed block reads as code.
function bodyParts(segments: Segment[], diagrams: (string | null)[]): ({ markdown: string } | { diagram: string })[] {
  if (!diagrams.some((diagram) => diagram !== null)) return [{ markdown: segments.map((segment) => segment.text).join('') }]
  const parts: ({ markdown: string } | { diagram: string })[] = []
  let markdown = ''
  for (const [index, segment] of segments.entries()) {
    const diagram = diagrams[index]
    if (diagram === null || diagram === undefined) markdown += segment.text
    else {
      if (markdown) parts.push({ markdown })
      markdown = ''
      parts.push({ diagram })
    }
  }
  if (markdown) parts.push({ markdown })
  return parts
}

function browserLines(browser: ObwBrowser | null): Line[] {
  const notice = (text: string): Line => ({ kind: 'notice', text })
  if (browser?.kind === 'error') return [{ kind: 'error', text: browser.message }]
  if (browser?.kind === 'rendering') return [notice('Rendering in the browser…')]
  if (browser?.kind !== 'opened') return []
  // Over SSH render.sh opens nothing and prints a URL instead; a local render opens its loopback URL.
  if (browser.url && !isLoopbackUrl(browser.url)) return [`Rendered: ${browser.path}`, `URL: ${browser.url}`].map(notice)
  const tailnet = browser.tailnet ? [`Tailnet: ${browser.tailnet}`] : []
  return [`Opened in the browser: ${browser.path}`, ...tailnet].map(notice)
}

type Config = (Scope & { path: string }) | { error: string }

function configPathIn(dir: string) {
  return dir === '/' ? '/.obsidian.yaml' : `${dir}/.obsidian.yaml`
}

function parentOf(dir: string) {
  const slash = dir.lastIndexOf('/')
  return slash > 0 ? dir.slice(0, slash) : '/'
}

async function readConfig($: any, path: string): Promise<Config> {
  let text: string
  try {
    text = await $.fs.read(path)
  } catch {
    return { error: `Could not read ${path}.` }
  }
  const { vault, project } = configOf(text)
  if (!vault && !project) return { error: `${path} has no vault or pm.project.` }
  if (!vault) return { error: `${path} has no vault.` }
  if (!project) return { error: `${path} has no pm.project.` }
  return { vault, project, path }
}

// `fs.exists` never rejects on the host, so a rejection here is a fault to show, not an absent file.
async function resolveConfig($: any): Promise<Config> {
  const cwd = await $.session.cwd()
  for (let dir = cwd; ; dir = parentOf(dir)) {
    const path = configPathIn(dir)
    if (await $.fs.exists(path)) return readConfig($, path)
    if (dir === '/') return { error: `No .obsidian.yaml in ${cwd} or any directory above it.` }
  }
}

const NO_BINDING_DIR = 'neither OBW_LAUNCHES_DIR nor HOME is set.'
const RELATIVE_BINDING_DIR = 'OBW_LAUNCHES_DIR or HOME is not an absolute path.'

async function bindingFile($: any): Promise<{ path: string | null; reason: string }> {
  const launchesDir = await $.env.get('OBW_LAUNCHES_DIR')
  const home = await $.env.get('HOME')
  const path = bindingPath(launchesDir || undefined, home || undefined, await $.session.id())
  return { path, reason: launchesDir || home ? RELATIVE_BINDING_DIR : NO_BINDING_DIR }
}

function clearBinding($: any) {
  return update($, binding, () => null)
}

// The card read patches only the binding it was started for: a later binding, or none, drops it.
async function showBinding($: any, record: Stored) {
  await update($, binding, (bound) => ({ ...record, card: bound && sameBinding(bound, record) ? bound.card : null }))
  if (!record.project) return
  const built = cardPathArgv({ vault: record.vault, project: record.project }, record.cardPath)
  if (!('argv' in built)) return
  const output = readOutput(await runProcess($, built.argv))
  const title = output.kind === 'card' ? headerOf(output.frontmatter).title : undefined
  const card = output.kind === 'card' ? { title: title ? bounded(title).text || null : null, ac: acLabel(output.body) } : null
  await update($, binding, (bound) => (bound && sameBinding(bound, record) ? { ...bound, card } : bound))
}

async function loadBinding($: any) {
  const { path } = await bindingFile($)
  if (!path) return
  if (!(await $.fs.exists(path))) return clearBinding($)
  const record = bindingOf(await $.fs.read(path))
  if (!record) return clearBinding($)
  await showBinding($, record)
}

type Outcome = { ok: true } | { ok: false; reason: string }

async function writeBinding($: any, card: Binding): Promise<Outcome> {
  try {
    const { path, reason } = await bindingFile($)
    if (!path) return { ok: false, reason }
    const createdAt = new Date(await $.clock.now()).toISOString()
    await $.fs.write(path, `${JSON.stringify({ cardPath: card.cardPath, vault: card.vault, project: card.project, createdAt })}\n`)
  } catch (error) {
    return { ok: false, reason: reasonOf(error) }
  }
  await showBinding($, card).catch(() => {})
  return { ok: true }
}

// What Claude's Bash result says: the tool's stdout, or the text the model reads when stdout is not a string.
function outputOf(result: any): string {
  const stdout = result?.result?.stdout
  if (typeof stdout === 'string') return stdout
  return typeof result?.text === 'string' ? result.text : ''
}

async function removeBinding($: any): Promise<Outcome> {
  let file: { path: string | null; reason: string }
  try {
    file = await bindingFile($)
  } catch (error) {
    return { ok: false, reason: reasonOf(error) }
  }
  const { path } = file
  if (!path) return { ok: false, reason: file.reason }
  const run = await runProcess($, ['rm', '-f', path])
  if (run.kind === 'rejected') return { ok: false, reason: 'rm did not run.' }
  if (run.exitCode !== 0) return { ok: false, reason: run.stderr.trim() || `rm exited ${run.exitCode}` }
  clearBinding($)
  return { ok: true }
}

async function followStatus($: any, command: unknown, output: string) {
  if (typeof command !== 'string') return
  const changes = statusChanges(command, output)
  if (!changes.length) return
  let config: Scope | null = null
  if (changes.some(change => change.vault === null || 'file' in change.target)) {
    const found = await resolveConfig($)
    if (!('error' in found)) config = { vault: found.vault, project: found.project }
  }
  const action = bindingAction(changes, config, await read($, binding))
  if (action?.kind === 'bind') await writeBinding($, action.card)
  else if (action?.kind === 'unbind') await removeBinding($)
}

// The only writer of this hint: a dashboard the CLI could not read may simply not exist yet, while a
// configuration fault names the file it read and says nothing about /obw:pm.
function pmHint(project: string) {
  return `If ${dashboardPath(project)} is missing, run /obw:pm to create it.`
}

// Rows the dashboard sent that the pane cannot open are their own outcome, not an empty view.
function outsideNotice(count: number, chosen: string, project: string) {
  return count === 1
    ? `1 row of the ${chosen} view is not a card under pm/${project} and was left out.`
    : `${count} rows of the ${chosen} view are not cards under pm/${project} and were left out.`
}

// A dashboard whose views were renamed or reordered may have no Active view; its own first view is then the one to open.
function defaultView(names: string[]) {
  if (names.includes(COUNT_VIEW)) return COUNT_VIEW
  return !names.length || names.includes('Active') ? 'Active' : names[0]
}

// The argument names a row wherever the view put it; a name no row carries falls back to the task folder.
function cardPathIn(cards: ReturnType<typeof listRows>, project: string, name: string) {
  return rowNamed(cards, project, name) ?? `${taskFolder(project)}${name}.md`
}

// A card argument stays on the view the pane is already showing, so the row the user is looking at is the row it opens.
function shownView(chosen: string | null, names: string[]) {
  return chosen && names.includes(chosen) ? chosen : defaultView(names)
}

function reasonOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function openView($: any, scope: Scope, views: string[], chosen: string, named: string | null, request: number | null, listing: Line | null = null) {
  const loading = (state: ObwPane): ObwPane => ({ ...LOADING, request: state.request, scope, views, chosen, listing })
  let current = request
  if (current === null) current = await begin($, loading)
  else if (!(await put($, current, loading))) return
  const built = baseQueryArgv(scope, chosen)
  if (!('argv' in built)) {
    await showMessage($, current, `"${chosen}" is not a view.`)
    return
  }
  const result = baseQueryOutput(await runProcess($, built.argv))
  if (result.kind === 'error') {
    const message: Line = { kind: 'error', text: bounded(result.message).text }
    const hint = missingViewHint(scope.project, result.message) ?? pmHint(scope.project)
    await put($, current, (state) => ({ ...state, loading: false, message, hint }))
    return
  }
  const listed = result.kind === 'rows' ? listRows(scope.project, result.rows) : []
  const cards = listed.map((card) => ({ path: card.path, label: bounded(card.label, MAX_LABEL).text, status: card.status === null ? null : bounded(card.status, MAX_LABEL).text }))
  const outside = result.kind === 'rows' ? rowsOutside(scope.project, result.rows) : 0
  const message: Line | null = outside
    ? { kind: 'notice', text: outsideNotice(outside, chosen, scope.project) }
    : !cards.length
      ? { kind: 'notice', text: `No cards in the ${chosen} view of pm/${scope.project}.` }
      : null
  const allTasks = chosen === COUNT_VIEW && result.kind === 'rows' ? listGroups(scope.project, result.rows) : null
  const drawn = await put($, current, (state) => ({ ...LOADING, request: state.request, loading: false, message, listing, scope, views, chosen, cards, allTasks }))
  if (!drawn || !named) return
  // All Tasks draws a card in its card view, so back leads to the list; any other view keeps its list above the card.
  const path = cardPathIn(cards, scope.project, named)
  await show($, (before) => ({ trail: chosen === COUNT_VIEW ? [path] : before, path }))
}

// A pick is taken from a drawing the pane has already replaced: a later /issue whose config resolution
// failed leaves no scope, and there is nothing to query then. Writing the loading state and failing on
// the way to the CLI would strand the pane on "Reading the vault…" with no picker to come back through.
async function pickView($: any, name: string) {
  const { scope, views } = await read($, pane)
  if (!scope) return
  await openView($, scope, views, name, null, null)
}

async function openIssue($: any, request: number, argument: string, chosen: string | null) {
  // A name holding `/` can still be a view name, which only the dashboard's listing can tell; every other bad name is refused here.
  if (argument && !argument.includes('/') && isBadCardName(argument)) {
    await showMessage($, request, `"${argument}" is not a card name.`)
    return
  }
  let config: Config
  try {
    config = await resolveConfig($)
  } catch (error) {
    await showMessage($, request, `Could not look for .obsidian.yaml: ${reasonOf(error)}`)
    return
  }
  if ('error' in config) {
    await showMessage($, request, config.error)
    return
  }
  const scope: Scope = { vault: config.vault, project: config.project }
  const listed = viewsArgv(config)
  if (!('argv' in listed)) {
    await showMessage(
      $,
      request,
      listed.refused === 'vault'
        ? `${config.path}: vault "${config.vault}" is not a vault name.`
        : `${config.path}: pm.project "${config.project}" cannot name a folder under pm/.`,
    )
    return
  }
  const listing = viewsOutput(await runProcess($, listed.argv))
  if ((await read($, pane)).request !== request) return
  const names = listing.kind === 'views' ? listing.views : []
  // Prefixed: beside a list the query did draw, the CLI's bare complaint reads as a contradiction.
  const listingLine: Line | null =
    listing.kind === 'error'
      ? { kind: 'error', text: `The dashboard's views could not be listed: ${bounded(listing.message).text}` }
      : names.includes(COUNT_VIEW)
        ? null
        : { kind: 'notice', text: missingViewText(config.project) }
  const resolved = resolveArgument(argument, names)
  if (resolved.kind === 'card') {
    if (isBadCardName(resolved.card)) {
      await showMessage($, request, `"${resolved.card}" is not a card name.`)
      return
    }
    if (!names.length) {
      const message: Line | null = listing.kind === 'error' ? { kind: 'error', text: bounded(listing.message).text } : null
      const hint = listing.kind === 'error' ? pmHint(config.project) : null
      const drawn = await put($, request, (state) => ({ ...LOADING, request: state.request, loading: false, scope, message, hint }))
      if (drawn) await show($, (before) => ({ trail: before, path: `${taskFolder(config.project)}${resolved.card}.md` }))
      return
    }
    return openView($, scope, names, shownView(chosen, names), resolved.card, request, listingLine)
  }
  return openView($, scope, names, resolved.kind === 'view' ? resolved.view : defaultView(names), null, request, listingLine)
}

function clipNotice(clipped: { text: string; clippedFrom: number | null }) {
  return clipped.clippedFrom === null ? null : `Clipped: showing ${clipped.text.length} of ${clipped.clippedFrom} characters.`
}

const RELATIONS = [
  ['parent', 'parent'],
  ['blocked_by', 'blocked by'],
  ['related', 'related'],
] as const

// The keys the list draws now, for the ring decisions that need to know what is on screen.
async function drawnItems($: any, listValue?: ObwList) {
  const state = await read($, pane)
  const items = state.allTasks && !state.trail.length ? listItems(state.allTasks.groups, listValue ?? (await read($, list))).items : []
  return { state, items, keys: items.map((item) => item.key) }
}

async function toggleFold($: any, key: string) {
  await update($, list, (value) => ({ ...value, folded: value.folded.includes(key) ? value.folded.filter((entry) => entry !== key) : [...value.folded, key] }))
}

// The ring goes back to the card it was on when a filter or an order change still draws that card.
async function restoreRing($: any, next: ObwList) {
  const { keys } = await drawnItems($, next)
  const target = reorderTarget((await read($, ring)).item, keys)
  if (target) await focus($, target)
}

const PRIORITY_CYCLE: ObwList['priority'][] = [null, 'high', 'medium', 'low']

async function cyclePriority($: any) {
  const next = await update($, list, (value) => ({ ...value, priority: PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(value.priority) + 1) % PRIORITY_CYCLE.length] }))
  await restoreRing($, next)
}

async function cycleSort($: any) {
  const next = await update($, list, (value) => ({ ...value, sort: (value.sort === 'title' ? 'priority' : 'title') as ObwList['sort'] }))
  await restoreRing($, next)
}

async function submitQuery($: any, text: string) {
  const next = await update($, list, (value) => ({ ...value, query: text }))
  const { items } = await drawnItems($, next)
  const target = submitTarget(items.map((item) => ({ key: item.key, kind: item.kind })))
  if (target) await focus($, target)
}

// The ring lands on `back` while a card remains, else on the row the person left.
function back($: any) {
  return show($, (before) => ({ trail: before.slice(0, -1), path: before.length > 1 ? before[before.length - 2] : null }), backTarget)
}

// Escape hands the keys back to the prompt before it closes the pane, so a refused close reopens the pane to take them again.
async function escapeBack($: any) {
  try {
    await $.ui.open(PANE)
  } catch {
    // A refused reopen leaves the pane open without the keys; the back step still happens.
  }
  await back($)
}

function listHandlers($: any): ListHandlers {
  const quiet = (work: Promise<unknown>) => void work.catch(() => {})
  return {
    fold: (key) => quiet(toggleFold($, key)),
    open: (path) => quiet(show($, () => ({ trail: [path], path }), () => BACK_KEY)),
    focusQuery: () => quiet(focus($, QUERY_KEY)),
    query: (text) => quiet(update($, list, (value) => ({ ...value, query: text }))),
    submit: (text) => quiet(submitQuery($, text)),
    priority: () => quiet(cyclePriority($)),
    sort: () => quiet(cycleSort($)),
    clear: () => quiet(update($, list, (value) => ({ ...value, query: '', priority: null }))),
  }
}

async function drawPane($: any, e: any) {
  const ui = await $.ui.resolve(e)
  const { Box, Text, Select } = ui
  const state = await read($, pane)
  const settings = await read($, list)
  const safe = (text: string) => bounded(text).text
  const dim = (text: string) => Text({ dimColor: true, children: [safe(text)] })
  const error = (text: string) => Text({ color: ERROR, children: [safe(text)] })
  const line = ({ kind, text }: Line) => (kind === 'error' ? error(text) : dim(text))
  const span = (text: string, color?: string) => Text({ ...(color ? { color } : {}), children: [safe(text)] })
  const bodyColumns = Number.isInteger(e.props?.bodyColumns) && e.props.bodyColumns > 0 ? e.props.bodyColumns : null
  const columns = bodyColumns ?? 80
  const ruleWidth = Math.min(bodyColumns ?? 40, MAX_CHARS)
  const draw: DrawContext = { ui, state, bound: await read($, binding), e, dim, error, line, span }

  if (state.trail.length) return cardView($, draw, { columns, ruleWidth })

  const children: any[] = []
  if (state.listing) children.push(line(state.listing))
  if (!state.loading && state.views.length && state.scope && state.chosen) {
    children.push(
      Select({
        key: 'views',
        options: state.views.map((name) => ({ value: safe(name), label: safe(name) })),
        value: safe(state.chosen),
        onSelect: (name: string) => void pickView($, name).catch(() => {}),
      }),
    )
  }
  const drawnList = state.allTasks && state.allTasks.groups.length ? state.allTasks : null
  if (drawnList) {
    children.push(...listChildren(ui, { surface: e.surface, columns, ruleWidth, allTasks: drawnList, list: settings, handlers: listHandlers($) }))
  } else if (state.cards.length) {
    children.push(
      Select({
        key: 'cards',
        options: state.cards.map((card) => ({ value: safe(card.path), label: safe(card.label) })),
        ...(state.selected ? { value: safe(state.selected) } : {}),
        onSelect: (path: string) => void show($, (before) => ({ trail: before, path })).catch(() => {}),
      }),
    )
  }
  if (state.message) children.push(line(state.message))
  if (state.hint) children.push(dim(state.hint))
  if (drawnList) children.push(listHints(ui, e.surface))
  const card = state.card
  if (!card) return Box({ flexDirection: 'column', children })
  // A blank row and a thin rule set the card off from the list above it.
  children.push(Box({ flexDirection: 'column', marginTop: 1, children: [dim('─'.repeat(ruleWidth)), ...cardRegion($, draw, card)] }))
  return Box({ flexDirection: 'column', children })
}

// What every drawing function of the pane needs besides `$`, which the hooks scan only accepts spelled out at its call sites.
type DrawContext = {
  ui: any
  state: ObwPane
  bound: ObwBound | null
  e: any
  dim: (text: string) => any
  error: (text: string) => any
  line: (line: Line) => any
  span: (text: string, color?: string) => any
}

// One relation line per link: a Button when the link names an All Tasks row, dim text when it names anything else.
function relationLines($: any, { ui, state }: DrawContext, card: Shown) {
  const { Box, Text, Button } = ui
  const rows = new Map((state.allTasks?.groups ?? []).flatMap((group) => group.rows.map((row) => [row.path, row] as const)))
  const lines: any[] = []
  for (const [field, label] of RELATIONS) {
    for (const name of card.relations[field]) {
      const path = state.scope ? rowNamed(state.cards, state.scope.project, name) : null
      const target = path === null ? null : { path, title: rows.get(path)?.title ?? cardName(path) }
      lines.push(
        Box({
          flexDirection: 'row',
          children: [
            Text({ color: ACCENT, children: ['› '] }),
            Text({ color: INACTIVE, children: [label.padEnd(11)] }),
            target
              ? Button({ plain: true, key: `rel:${field}:${target.path}`, label: bounded(target.title).text || '—', onPress: () => void show($, (before) => ({ trail: [...before, target.path], path: target.path })).catch(() => {}) })
              : Text({ color: SUBTLE, children: [bounded(`${name} · not in all tasks`).text] }),
          ],
        }),
      )
    }
  }
  return lines
}

function cardRegion($: any, draw: DrawContext, card: ObwCard) {
  const { ui, state, bound, e, dim, error, line, span } = draw
  const { Text, Markdown, Button, Code, Box } = ui
  const region: any[] = []
  if (card.kind === 'loading') region.push(dim(`Reading ${cardName(card.path)}…`))
  if (card.kind === 'error') region.push(error(card.message))
  if (card.kind === 'shown') {
    const { title, status, priority } = card.header
    const body = bounded(card.body)
    const ac = acLabel(card.body)
    region.push(Text({ bold: true, children: [bounded(title ?? cardName(card.path)).text] }))
    region.push(
      Text({
        children: [
          dim('status: '),
          span(status ?? '—', statusColor(status)),
          dim(' · priority: '),
          span(priority ?? '—', priorityColor(priority)),
          ...(ac ? [dim(' · '), span(ac)] : []),
        ],
      }),
    )
    // Only the All Tasks card view knows the rows a link can name; another view's cards are not all of them.
    const relations = state.trail.length ? relationLines($, draw, card) : []
    if (relations.length) region.push(Box({ flexDirection: 'column', children: relations }))
    if (e.surface === 'terminal') {
      region.push(Button({ key: 'bind', label: 'Bind this session', onPress: () => { void bindShown($).catch(() => {}) } }))
      if (bound && state.scope && sameBinding(bound, { cardPath: card.path, vault: state.scope.vault })) {
        region.push(Button({ key: 'unbind', label: 'Unbind this session', onPress: () => { void unbindShown($).catch(() => {}) } }))
      }
      if (card.bindLine) region.push(line(card.bindLine))
    }
    // Only the terminal can run render.sh: `process` is CLI only.
    if (card.vizRoot && e.surface === 'terminal') {
      region.push(
        Button({
          key: 'open-in-browser',
          label: 'Open in browser',
          onPress: () => {
            void openInBrowser($).catch(() => {})
          },
        }),
        ...browserLines(card.browser).map(line),
      )
    }
    const bodyClip = clipNotice(body)
    if (bodyClip) region.push(dim(bodyClip))
    for (const part of bodyParts(card.segments, card.diagrams)) {
      if ('markdown' in part) region.push(Markdown({ text: bounded(part.markdown).text }))
      else {
        const diagram = bounded(part.diagram)
        const diagramClip = clipNotice(diagram)
        if (diagramClip) region.push(dim(diagramClip))
        region.push(Code({ source: diagram.text, wrap: 'truncate-end' }))
      }
    }
  }
  return region
}

// The card view: the path taken from the list, a back Button, the card, and what the keys do here.
function cardView($: any, draw: DrawContext, { columns, ruleWidth }: { columns: number; ruleWidth: number }) {
  const { ui, state, dim } = draw
  const { Box, Text, Button } = ui
  const { card } = state
  const crumbs = ['list', ...state.trail.slice(0, -1).map((path) => bounded(cardName(path)).text)]
  const hasRelations = card?.kind === 'shown' && Object.values(card.relations).some((names) => names.length > 0)
  const hints = ['↑↓ scroll', ...(hasRelations ? ['tab links'] : []), 'esc or b back']
  return Box({
    flexDirection: 'column',
    children: [
      Box({
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: Math.max(0, columns - 2),
        children: [
          Text({ color: INACTIVE, wrap: 'truncate-end', children: [bounded(fitWidth(`${crumbs.join(' › ')} ›`, Math.max(10, columns - 12)).trimEnd()).text] }),
          Button({ plain: true, key: BACK_KEY, hotkey: 'b', label: 'back', autoFocus: true, onPress: () => void back($).catch(() => {}) }),
        ],
      }),
      Box({ flexDirection: 'column', marginTop: 1, children: [dim('─'.repeat(ruleWidth)), ...(card ? cardRegion($, draw, card) : [])] }),
      Box({ marginTop: 1, children: [Text({ color: SUBTLE, wrap: 'truncate-end', children: [hints.join(' · ')] })] }),
    ],
  })
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'issue',
        description: 'Show an obw dashboard view or card in a pane',
        argumentHint: '[view|card]',
        immediate: true,
      })
    } catch {
      // A refused /issue must not stop the session.
    }
    void loadBinding($).catch(() => {})
    return next(e)
  })

  // The filter, the folds and the sort a person set stay for the session; only what the pane shows is read again.
  on('command.run', { command: 'issue' }, async ($, e) => {
    const argument = (e.args ?? '').trim()
    const { chosen } = await read($, pane)
    const request = await begin($, () => LOADING)
    await update($, ring, () => RING_START)
    try {
      await $.ui.open(PANE)
    } catch {
      return { text: 'obw: the /issue pane could not open.' }
    }
    await openIssue($, request, argument, chosen)
    // Card text never goes into the result: the model would read it.
    return {}
  })

  // In a card, Escape (the person's close) goes back a step instead; in the list it closes the pane.
  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    if (!closeGoesBack(e.origin, (await read($, pane)).trail.length)) return next(e)
    void escapeBack($).catch(() => {})
    return { deny: 'Escape in a card goes back' }
  })

  on('ui.focus', { requestId: PANE_ID }, async ($, e, next) => {
    const moved = await next(e)
    if (!('deny' in moved && moved.deny)) await update($, ring, (previous) => nextRing(previous, e.element))
    return moved
  })

  // An arrow in the list walks the ring and the window follows it; the wheel, the page keys and a card keep the engine's scrolling.
  on('ui.scroll', { requestId: PANE_ID }, async ($, e, next) => {
    const { state, items } = await drawnItems($)
    const at = (await read($, ring)).at
    const first = submitTarget(items.map((item) => ({ key: item.key, kind: item.kind })))
    const target = arrowMove(e, { isList: !state.loading && !state.trail.length && items.length > 0, items: items.map((item) => item.key), firstMatch: first, at })
    if (target === null || !(await focus($, target))) return next(e)
    try {
      await $.ui.scroll({ in: PANE_ID, to: { key: target } })
    } catch {
      // The ring moved; a window that cannot follow it only leaves the item off screen.
    }
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    try {
      return await drawPane($, e)
    } catch {
      try {
        const { Text } = await $.ui.resolve(e)
        return Text({ dimColor: true, children: ['obw: the card could not be drawn.'] })
      } catch {
        return next(e)
      }
    }
  })
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    void followStatus($, e.command, outputOf(result)).catch(() => {})
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) void loadBinding($).catch(() => {})
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const bound = await read($, binding)
    if (!bound || e.props?.hasSurvey) return next(e)
    const beneath = await next(e)
    try {
      const { Box, Text } = await $.ui.resolve(e)
      const { cardPath, card } = bound
      const title = card?.title
      const line = Text({
        wrap: 'truncate-end',
        children: [
          Text({ color: 'success', children: ['●'] }),
          ` ${bounded(cardName(cardPath)).text}`,
          ...(title ? [`  ${title}`] : []),
          ...(card?.ac ? [`  ${card.ac}`] : []),
        ],
      })
      return Box({ flexDirection: 'column', children: [line, beneath] })
    } catch {
      return beneath
    }
  })
}
