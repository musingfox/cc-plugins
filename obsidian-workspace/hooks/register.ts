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
import { listGroups } from './list.ts'
import { boardSize } from './board-size.ts'
import { boardMessage } from './board-message.ts'
import type { Card } from './board.ts'
import { acLabel, headerOf } from './card.ts'
import type { CardHeader } from './card.ts'
import { vizManifestPath, vizInstallPath, renderTarget, renderArgv, renderOutcome, RENDER_TIMEOUT_MS } from './viz.ts'
import { splitFences, termaidHeaderAllowed, diagramOutcome, TERMAID_ARGV, TERMAID_TIMEOUT_MS } from './mermaid.ts'
import type { Segment } from './mermaid.ts'
import { priorityColor, statusColor, RED } from './style.ts'

const PANE = { id: 'obw-issue', title: 'obw issue', focus: true, closeOnEscape: true }

type Browser = { kind: 'rendering' } | ReturnType<typeof renderOutcome>

// The card region under the list has its own state, so a card's outcome never replaces the list's message.
// `segments` splits the clipped body once; `diagrams` is indexed by a mermaid block's position in `segments`.
type CardRegion =
  | { kind: 'loading'; path: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'shown'
      path: string
      header: CardHeader
      body: string
      segments: Segment[]
      vizRoot: string | null
      browser: Browser | null
      diagrams: (string | undefined)[]
    }

type Shown = Extract<CardRegion, { kind: 'shown' }>

type Line = { kind: 'error' | 'notice'; text: string }

// Where the shown card was asked for: `list` is a row opened inside the All Tasks Client, drawn there as plain text.
type Origin = 'argument' | 'list'

// `loading` cannot be read off the message: the loading notice and the empty-view notice are both notices.
type PaneState = {
  message: Line | null
  hint: string | null
  listing: Line | null
  loading: boolean
  scope: Scope | null
  views: string[]
  chosen: string | null
  cards: ReturnType<typeof listRows>
  groups: ReturnType<typeof listGroups> | null
  selected: string | null
  card: CardRegion | null
  origin: Origin
}

const LOADING: PaneState = {
  message: { kind: 'notice', text: 'Reading the vault…' },
  hint: null,
  listing: null,
  loading: true,
  scope: null,
  views: [],
  chosen: null,
  cards: [],
  groups: null,
  selected: null,
  card: null,
  origin: 'argument',
}

let state: PaneState = LOADING
// A CLI call can settle after a newer /issue or card read started; only the latest request writes the state.
let requests = 0

async function runProcess($: any, argv: string[], timeoutMs = OBSIDIAN_TIMEOUT_MS, stdin?: string): Promise<Run> {
  try {
    const result = await $.process.run(argv, { ...(stdin === undefined ? {} : { stdin }), timeoutMs })
    return { kind: 'exited', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
  } catch {
    return { kind: 'rejected' }
  }
}

function invalidate($: any) {
  $.ui.invalidate('ui.render')
}

function showMessage($: any, request: number, message: string) {
  if (request === requests) {
    state = { ...LOADING, loading: false, message: { kind: 'error', text: message } }
    invalidate($)
  }
}

function showCard($: any, request: number, name: string, card: CardRegion, origin: Origin = 'argument') {
  if (request === requests) {
    state = { ...state, selected: name, card, origin }
    invalidate($)
  }
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

async function show($: any, path: string, origin: Origin = 'argument') {
  const { scope } = state
  if (!scope) return
  const request = ++requests
  const put = (card: CardRegion) => showCard($, request, path, card, origin)
  const built = cardPathArgv(scope, path)
  if (!('argv' in built)) return put({ kind: 'error', message: `"${path}" is not a card path.` })
  put({ kind: 'loading', path })
  const output = readOutput(await runProcess($, built.argv))
  if (output.kind === 'error') return put({ kind: 'error', message: output.message })
  // The Client draws a card as plain text: it has no Button to open the browser and no room for diagrams.
  const vizRoot = origin === 'list' ? null : await findViz($)
  const header = headerOf(output.frontmatter)
  const segments = splitFences(bounded(output.body).text)
  put({ kind: 'shown', path, header, body: output.body, segments, vizRoot, browser: null, diagrams: [] })
  if (origin === 'list') return
  // termaid never holds /issue: an offline uvx can take seconds, and the card is already drawn.
  void drawDiagrams($, request, segments).catch(() => {})
}

// One run at a time: a rejected run means uvx fails for every block, and a superseded read never draws.
async function drawDiagrams($: any, request: number, segments: Segment[]) {
  for (const [index, segment] of segments.entries()) {
    if (segment.kind !== 'mermaid' || !termaidHeaderAllowed(segment.source) || request !== requests) continue
    const run = await runProcess($, TERMAID_ARGV, TERMAID_TIMEOUT_MS, segment.source)
    if (run.kind === 'rejected') return
    const diagram = diagramOutcome(run)
    if (diagram !== null) {
      patchShown($, request, card => {
        const diagrams = [...card.diagrams]
        diagrams[index] = diagram
        return { ...card, diagrams }
      })
    }
  }
}

// A diagram or press result writes only under the card read it came from: a newer read, even of the same card, drops it.
function patchShown($: any, request: number, patch: (card: Shown) => Shown) {
  const card = state.card
  if (request === requests && card?.kind === 'shown') {
    state = { ...state, card: patch(card) }
    invalidate($)
  }
}

function showBrowser($: any, request: number, browser: Browser) {
  patchShown($, request, card => ({ ...card, browser }))
}

async function openInBrowser($: any) {
  const card = state.card
  if (card?.kind !== 'shown' || !card.vizRoot || !state.scope) return
  const request = requests
  const target = renderTarget(rowSlug(state.scope.project, card.path))
  showBrowser($, request, { kind: 'rendering' })
  try {
    await $.fs.write(target.file, card.body)
  } catch (error) {
    return showBrowser($, request, { kind: 'error', message: `Could not write ${target.file}: ${reasonOf(error)}` })
  }
  showBrowser($, request, renderOutcome(await runProcess($, renderArgv(card.vizRoot, target), RENDER_TIMEOUT_MS)))
}

// A block without a drawn diagram stays inside the markdown around it, so a pending or failed block reads as code.
function bodyParts(segments: Segment[], diagrams: (string | undefined)[]): ({ markdown: string } | { diagram: string })[] {
  if (!diagrams.some(Boolean)) return [{ markdown: segments.map(segment => segment.text).join('') }]
  const parts: ({ markdown: string } | { diagram: string })[] = []
  let markdown = ''
  for (const [index, segment] of segments.entries()) {
    const diagram = diagrams[index]
    if (diagram === undefined) markdown += segment.text
    else {
      if (markdown) parts.push({ markdown })
      markdown = ''
      parts.push({ diagram })
    }
  }
  if (markdown) parts.push({ markdown })
  return parts
}

function browserLines(browser: Browser | null): Line[] {
  const notice = (text: string): Line => ({ kind: 'notice', text })
  if (browser?.kind === 'error') return [{ kind: 'error', text: browser.message }]
  if (browser?.kind === 'rendering') return [notice('Rendering in the browser…')]
  if (browser?.kind !== 'opened') return []
  // Over SSH render.sh opens nothing and prints a URL instead.
  return (browser.url ? [`Rendered: ${browser.path}`, `URL: ${browser.url}`] : [`Opened in the browser: ${browser.path}`]).map(notice)
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

async function openView($: any, scope: Scope, views: string[], chosen: string, named: string | null, request = ++requests, listing: Line | null = null) {
  state = { ...LOADING, scope, views, chosen, listing }
  invalidate($)
  const built = baseQueryArgv(scope, chosen)
  if (!('argv' in built)) return showMessage($, request, `"${chosen}" is not a view.`)
  const result = baseQueryOutput(await runProcess($, built.argv))
  if (request !== requests) return
  if (result.kind === 'error') {
    state = { ...state, loading: false, message: { kind: 'error', text: result.message }, hint: missingViewHint(scope.project, result.message) ?? pmHint(scope.project) }
    invalidate($)
    return
  }
  const cards = result.kind === 'rows' ? listRows(scope.project, result.rows) : []
  const outside = result.kind === 'rows' ? rowsOutside(scope.project, result.rows) : 0
  const message: Line | null = outside
    ? { kind: 'notice', text: outsideNotice(outside, chosen, scope.project) }
    : !cards.length
      ? { kind: 'notice', text: `No cards in the ${chosen} view of pm/${scope.project}.` }
      : null
  state = {
    message,
    hint: null,
    listing,
    loading: false,
    scope,
    views,
    chosen,
    cards,
    groups: chosen === COUNT_VIEW && result.kind === 'rows' ? listGroups(scope.project, result.rows) : null,
    selected: null,
    card: null,
  }
  invalidate($)
  if (named) await show($, cardPathIn(cards, scope.project, named))
}

// A pick is taken from a drawing the pane has already replaced: a later /issue whose config resolution
// failed leaves no scope, and there is nothing to query then. Writing the loading state and failing on
// the way to the CLI would strand the pane on "Reading the vault…" with no picker to come back through.
function pickView($: any, name: string) {
  const { scope, views } = state
  if (!scope) return
  void openView($, scope, views, name, null).catch(() => {})
}

async function openIssue($: any, request: number, argument: string, chosen: string | null) {
  // A name holding `/` can still be a view name, which only the dashboard's listing can tell; every other bad name is refused here.
  if (argument && !argument.includes('/') && isBadCardName(argument)) return showMessage($, request, `"${argument}" is not a card name.`)
  let config: Config
  try {
    config = await resolveConfig($)
  } catch (error) {
    return showMessage($, request, `Could not look for .obsidian.yaml: ${reasonOf(error)}`)
  }
  if ('error' in config) return showMessage($, request, config.error)
  const list = viewsArgv(config)
  if (!('argv' in list)) {
    return showMessage(
      $,
      request,
      list.refused === 'vault'
        ? `${config.path}: vault "${config.vault}" is not a vault name.`
        : `${config.path}: pm.project "${config.project}" cannot name a folder under pm/.`,
    )
  }
  const listing = viewsOutput(await runProcess($, list.argv))
  if (request !== requests) return
  const names = listing.kind === 'views' ? listing.views : []
  // Prefixed: beside a list the query did draw, the CLI's bare complaint reads as a contradiction.
  const listingLine: Line | null =
    listing.kind === 'error'
      ? { kind: 'error', text: `The dashboard's views could not be listed: ${listing.message}` }
      : names.includes(COUNT_VIEW)
        ? null
        : { kind: 'notice', text: missingViewText(config.project) }
  const resolved = resolveArgument(argument, names)
  if (resolved.kind === 'card') {
    if (isBadCardName(resolved.card)) return showMessage($, request, `"${resolved.card}" is not a card name.`)
    if (!names.length) {
      state = {
        ...LOADING,
        loading: false,
        scope: config,
        views: [],
        chosen: null,
        message: listing.kind === 'error' ? { kind: 'error', text: listing.message } : null,
        hint: listing.kind === 'error' ? pmHint(config.project) : null,
      }
      return show($, `${taskFolder(config.project)}${resolved.card}.md`)
    }
    return openView($, config, names, shownView(chosen, names), resolved.card, request, listingLine)
  }
  return openView($, config, names, resolved.kind === 'view' ? resolved.view : defaultView(names), null, request, listingLine)
}

function clipNotice(clipped: { text: string; clippedFrom: number | null }) {
  return clipped.clippedFrom === null ? null : `Clipped: showing ${clipped.text.length} of ${clipped.clippedFrom} characters.`
}

// The Client module draws its props as given, so every vault string is bounded here.
function boardCard(card: CardRegion): Card {
  const safe = (text: string) => bounded(text).text
  if (card.kind === 'loading') return { kind: 'loading', name: safe(cardName(card.path)) }
  if (card.kind === 'error') return { kind: 'error', message: safe(card.message) }
  const { title, status, priority } = card.header
  const body = bounded(card.body)
  return {
    kind: 'shown',
    path: card.path,
    title: safe(title ?? cardName(card.path)),
    status: safe(status ?? '—'),
    priority: safe(priority ?? '—'),
    ac: acLabel(card.body),
    clip: clipNotice(body),
    body: body.text,
  }
}

// vscode and mobile draw a Client as an empty Box without complaint, so only the surface can say whether it will show.
function hasClient(surface: string) {
  return surface === 'terminal' || surface === 'desktop'
}

async function drawPane($: any, e: any) {
  const { Box, Text, Select, Markdown, Button, Code, Client } = await $.ui.resolve(e)
  const safe = (text: string) => bounded(text).text
  const dim = (text: string) => Text({ dimColor: true, children: [safe(text)] })
  const red = (text: string) => Text({ color: RED, children: [safe(text)] })
  const line = ({ kind, text }: Line) => (kind === 'error' ? red(text) : dim(text))
  const span = (text: string, color?: string) => Text({ ...(color ? { color } : {}), children: [safe(text)] })
  const children: any[] = []
  if (state.listing) children.push(line(state.listing))
  if (!state.loading && state.views.length && state.scope && state.chosen) {
    children.push(
      Select({
        key: 'views',
        options: state.views.map(name => ({ value: safe(name), label: safe(name) })),
        value: safe(state.chosen),
        onSelect: (name: string) => pickView($, name),
      }),
    )
  }
  const board = hasClient(e.surface) && state.groups && state.groups.groups.length ? state.groups : null
  if (board) {
    const { rows, columns } = boardSize({
      bodyRows: e.props?.scroll?.bodyRows,
      bodyColumns: e.props?.bodyColumns,
      siblings: [state.listing, state.message].flatMap((line) => (line ? [safe(line.text)] : [])),
      argumentCard: state.card !== null && state.origin === 'argument',
    })
    const listCard = state.card && state.origin === 'list' ? boardCard(state.card) : null
    const shown = listCard ? { groups: [], hidden: 0, card: listCard } : { groups: board.groups, hidden: board.hidden, card: null }
    children.push(Client({ key: 'board', module: './board.ts', width: columns, height: rows, props: { rows, columns, ...shown } }))
  } else if (state.cards.length) {
    children.push(
      Select({
        key: 'cards',
        options: state.cards.map(card => ({ value: safe(card.path), label: safe(card.label) })),
        ...(state.selected ? { value: safe(state.selected) } : {}),
        onSelect: (path: string) => {
          void show($, path).catch(() => {})
        },
      }),
    )
  }
  if (state.message) children.push(line(state.message))
  if (state.hint) children.push(dim(state.hint))
  const card = state.card
  if (!card || (board && state.origin === 'list')) return Box({ flexDirection: 'column', children })
  const columns = e.props?.bodyColumns
  const ruleWidth = Number.isInteger(columns) && columns > 0 ? Math.min(columns, MAX_CHARS) : 40
  const region: any[] = [dim('─'.repeat(ruleWidth))]
  if (card.kind === 'loading') region.push(dim(`Reading ${cardName(card.path)}…`))
  if (card.kind === 'error') region.push(red(card.message))
  if (card.kind === 'shown') {
    const { title, status, priority } = card.header
    const body = bounded(card.body)
    const ac = acLabel(card.body)
    region.push(Text({ bold: true, children: [safe(title ?? cardName(card.path))] }))
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
      if ('markdown' in part) region.push(Markdown({ text: safe(part.markdown) }))
      else {
        const diagram = bounded(part.diagram)
        const diagramClip = clipNotice(diagram)
        if (diagramClip) region.push(dim(diagramClip))
        region.push(Code({ source: diagram.text, wrap: 'truncate-end' }))
      }
    }
  }
  // A blank row and a thin rule set the card off from the list above it.
  children.push(Box({ flexDirection: 'column', marginTop: 1, children: region }))
  return Box({ flexDirection: 'column', children })
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
    return next(e)
  })

  on('command.run', { command: 'issue' }, async ($, e) => {
    const argument = (e.args ?? '').trim()
    const chosen = state.chosen
    const request = ++requests
    state = LOADING
    try {
      await $.ui.open(PANE)
    } catch {
      return { text: 'obw: the /issue pane could not open.' }
    }
    await openIssue($, request, argument, chosen)
    // Card text never goes into the result: the model would read it.
    return {}
  })

  on('ui.message', async ($, e, next) => {
    const listDrawn = hasClient(e.surface) && state.groups && state.chosen === COUNT_VIEW && !(state.card && state.origin === 'list')
    const listed = listDrawn ? state.groups!.groups.flatMap((group) => group.rows.map((row) => row.path)) : null
    const message = boardMessage(e, listed)
    if (!message) return next(e)
    if (message.kind === 'open') void show($, message.path, 'list').catch(() => {})
    else if (state.card && state.origin === 'list') {
      // A read still running for the card left behind must not bring it back.
      ++requests
      state = { ...state, selected: null, card: null, origin: 'argument' }
      invalidate($)
    }
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE.id) return next(e)
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
}
