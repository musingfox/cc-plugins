import type { On } from 'claude-code'
import { bounded, MAX_CHARS } from './bounds.ts'
import { configOf } from './config.ts'
import { isBadCardName, taskFolder } from './argv.ts'
import { baseQueryArgv, cardPathArgv, viewsArgv } from './base-argv.ts'
import { baseQueryOutput, viewsOutput, readOutput, OBSIDIAN_TIMEOUT_MS } from './cli-output.ts'
import type { Run } from './cli-output.ts'
import { listRows, resolveArgument, rowSlug } from './rows.ts'
import { acLabel, headerOf } from './card.ts'
import type { CardHeader } from './card.ts'
import { vizManifestPath, vizInstallPath, renderTarget, renderArgv, renderOutcome, RENDER_TIMEOUT_MS } from './viz.ts'
import { splitFences, termaidHeaderAllowed, diagramOutcome, TERMAID_ARGV, TERMAID_TIMEOUT_MS } from './mermaid.ts'
import type { Segment } from './mermaid.ts'
import { priorityColor, statusColor, RED } from './style.ts'

const PANE = { id: 'obw-issue', title: 'obw issue', focus: true, closeOnEscape: true }
type Browser = { kind: 'rendering' } | ReturnType<typeof renderOutcome>
type CardRegion = { kind: 'loading'; name: string } | { kind: 'error'; message: string } | { kind: 'shown'; name: string; header: CardHeader; body: string; segments: Segment[]; vizRoot: string | null; browser: Browser | null; diagrams: (string | undefined)[] }
type Shown = Extract<CardRegion, { kind: 'shown' }>
type Line = { kind: 'error' | 'notice'; text: string }
type Scope = { vault: string; project: string }
// `loading` cannot be read off the message: the loading notice and the empty-view notice are both notices.
type View = { message: Line | null; hint: string | null; loading: boolean; scope: Scope | null; views: string[]; chosen: string | null; cards: ReturnType<typeof listRows>; selected: string | null; card: CardRegion | null }
const LOADING: View = { message: { kind: 'notice', text: 'Reading the vault…' }, hint: null, loading: true, scope: null, views: [], chosen: null, cards: [], selected: null, card: null }
let view: View = LOADING
let requests = 0

async function runProcess($: any, argv: string[], timeoutMs = OBSIDIAN_TIMEOUT_MS, stdin?: string): Promise<Run> {
  try { const result = await $.process.run(argv, { ...(stdin === undefined ? {} : { stdin }), timeoutMs }); return { kind: 'exited', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } } catch { return { kind: 'rejected' } }
}
function invalidate($: any) { $.ui.invalidate('ui.render') }
function showMessage($: any, request: number, message: string) { if (request === requests) { view = { ...LOADING, loading: false, message: { kind: 'error', text: message } }; invalidate($) } }
function showCard($: any, request: number, name: string, card: CardRegion) { if (request === requests) { view = { ...view, selected: name, card }; invalidate($) } }
async function findViz($: any): Promise<string | null> { try { const path = vizManifestPath(await $.env.get('CLAUDE_CONFIG_DIR'), await $.env.get('HOME')); return path ? vizInstallPath(await $.fs.read(path)) : null } catch { return null } }

async function show($: any, path: string) {
  const { scope } = view; if (!scope) return
  const request = ++requests; const built = cardPathArgv(scope.vault, scope.project, path)
  if (!('argv' in built)) return showCard($, request, path, { kind: 'error', message: `"${path}" is not a card path.` })
  showCard($, request, path, { kind: 'loading', name: path })
  const output = readOutput(await runProcess($, built.argv))
  if (output.kind === 'error') return showCard($, request, path, { kind: 'error', message: output.message })
  const vizRoot = await findViz($), header = headerOf(output.frontmatter), segments = splitFences(bounded(output.body).text)
  showCard($, request, path, { kind: 'shown', name: path, header, body: output.body, segments, vizRoot, browser: null, diagrams: [] })
  void drawDiagrams($, request, segments).catch(() => {})
}
async function drawDiagrams($: any, request: number, segments: Segment[]) { for (const [index, segment] of segments.entries()) { if (segment.kind !== 'mermaid' || !termaidHeaderAllowed(segment.source) || request !== requests) continue; const run = await runProcess($, TERMAID_ARGV, TERMAID_TIMEOUT_MS, segment.source); if (run.kind === 'rejected') return; const diagram = diagramOutcome(run); if (diagram !== null) patchShown($, request, card => { const diagrams = [...card.diagrams]; diagrams[index] = diagram; return { ...card, diagrams } }) } }
function patchShown($: any, request: number, patch: (card: Shown) => Shown) { const card = view.card; if (request === requests && card?.kind === 'shown') { view = { ...view, card: patch(card) }; invalidate($) } }
function showBrowser($: any, request: number, browser: Browser) { patchShown($, request, card => ({ ...card, browser })) }
async function openInBrowser($: any) { const card = view.card; if (card?.kind !== 'shown' || !card.vizRoot || !view.scope) return; const request = requests, target = renderTarget(rowSlug(view.scope.project, card.name)); showBrowser($, request, { kind: 'rendering' }); try { await $.fs.write(target.file, card.body) } catch (error) { return showBrowser($, request, { kind: 'error', message: `Could not write ${target.file}: ${reasonOf(error)}` }) }; showBrowser($, request, renderOutcome(await runProcess($, renderArgv(card.vizRoot, target), RENDER_TIMEOUT_MS))) }
function bodyParts(segments: Segment[], diagrams: (string | undefined)[]): ({ markdown: string } | { diagram: string })[] { if (!diagrams.some(Boolean)) return [{ markdown: segments.map(segment => segment.text).join('') }]; const parts: ({ markdown: string } | { diagram: string })[] = []; let markdown = ''; for (const [index, segment] of segments.entries()) { const diagram = diagrams[index]; if (diagram === undefined) markdown += segment.text; else { if (markdown) parts.push({ markdown }); markdown = ''; parts.push({ diagram }) } }; if (markdown) parts.push({ markdown }); return parts }
function browserLines(browser: Browser | null): Line[] { const notice = (text: string): Line => ({ kind: 'notice', text }); if (browser?.kind === 'error') return [{ kind: 'error', text: browser.message }]; if (browser?.kind === 'rendering') return [notice('Rendering in the browser…')]; if (browser?.kind !== 'opened') return []; return (browser.url ? [`Rendered: ${browser.path}`, `URL: ${browser.url}`] : [`Opened in the browser: ${browser.path}`]).map(notice) }
type Config = Scope | { error: string }
function configPathIn(dir: string) { return dir === '/' ? '/.obsidian.yaml' : `${dir}/.obsidian.yaml` }
function parentOf(dir: string) { const slash = dir.lastIndexOf('/'); return slash > 0 ? dir.slice(0, slash) : '/' }
async function readConfig($: any, path: string): Promise<Config> { let text: string; try { text = await $.fs.read(path) } catch { return { error: `Could not read ${path}.` } }; const { vault, project } = configOf(text); if (!vault && !project) return { error: `${path} has no vault or pm.project.` }; if (!vault) return { error: `${path} has no vault.` }; if (!project) return { error: `${path} has no pm.project.` }; return { vault, project } }
async function resolveConfig($: any): Promise<Config> { const cwd = await $.session.cwd(); for (let dir = cwd;; dir = parentOf(dir)) { const path = configPathIn(dir); if (await $.fs.exists(path)) return readConfig($, path); if (dir === '/') return { error: `No .obsidian.yaml in ${cwd} or any directory above it.` } } }
function reasonOf(error: unknown) { return error instanceof Error ? error.message : String(error) }

async function openView($: any, scope: Scope, views: string[], chosen: string, card: string | null, request = ++requests) {
  view = { ...LOADING, scope, views, chosen }; invalidate($)
  const built = baseQueryArgv(scope.vault, scope.project, chosen)
  if (!('argv' in built)) return showMessage($, request, `"${chosen}" is not a view.`)
  const result = baseQueryOutput(await runProcess($, built.argv)); if (request !== requests) return
  if (result.kind === 'error') { view = { ...view, loading: false, message: { kind: 'error', text: result.message }, hint: `If pm/${scope.project}/dashboard.base is missing, run /obw:pm to create it.` }; invalidate($); return }
  const cards = result.kind === 'rows' ? listRows(scope.project, result.rows) : []
  view = { message: result.kind === 'empty' || !cards.length ? { kind: 'notice', text: `No cards in the ${chosen} view of pm/${scope.project}.` } : null, hint: null, loading: false, scope, views, chosen, cards, selected: null, card: null }; invalidate($)
  if (card) await show($, card)
}
async function openIssue($: any, request: number, argument: string) {
  if (argument && isBadCardName(argument)) return showMessage($, request, `"${argument}" is not a card name.`)
  let config: Config; try { config = await resolveConfig($) } catch (error) { return showMessage($, request, `Could not look for .obsidian.yaml: ${reasonOf(error)}`) }; if ('error' in config) return showMessage($, request, config.error)
  const list = viewsArgv(config.vault, config.project); if (!('argv' in list)) return showMessage($, request, `pm.project "${config.project}" cannot name a folder under pm/.`)
  const listing = viewsOutput(await runProcess($, list.argv)); if (request !== requests) return
  const names = listing.kind === 'views' ? listing.views : []
  const resolved = resolveArgument(argument, names)
  if (resolved.kind === 'card') { if (!names.length) { view = { ...LOADING, loading: false, scope: config, views: [], chosen: null, message: listing.kind === 'error' ? { kind: 'error', text: listing.message } : null }; return show($, `${taskFolder(config.project)}${resolved.card}.md`) }; return openView($, config, names, 'Active', `${taskFolder(config.project)}${resolved.card}.md`, request) }
  return openView($, config, names, resolved.kind === 'view' ? resolved.view : 'Active', null, request)
}

async function drawPane($: any, e: any) {
  const { Box, Text, Select, Markdown, Button, Code } = await $.ui.resolve(e); const safe = (text: string) => bounded(text).text; const dim = (text: string) => Text({ dimColor: true, children: [safe(text)] }); const red = (text: string) => Text({ color: RED, children: [safe(text)] }); const line = ({ kind, text }: Line) => kind === 'error' ? red(text) : dim(text); const span = (text: string, color?: string) => Text({ ...(color ? { color } : {}), children: [safe(text)] }); const children: any[] = []
  if (!view.loading && view.views.length && view.scope && view.chosen) children.push(Select({ key: 'views', options: view.views.map(name => ({ value: safe(name), label: safe(name) })), value: safe(view.chosen), onSelect: (name: string) => { void openView($, view.scope!, view.views, name, null).catch(() => {}) } }))
  if (view.cards.length) children.push(Select({ key: 'cards', options: view.cards.map(card => ({ value: safe(card.path), label: safe(card.label) })), ...(view.selected ? { value: safe(view.selected) } : {}), onSelect: (path: string) => { void show($, path).catch(() => {}) } }))
  if (view.message) children.push(line(view.message)); if (view.hint) children.push(dim(view.hint))
  const card = view.card; if (!card) return Box({ flexDirection: 'column', children }); const columns = e.props?.bodyColumns, ruleWidth = Number.isInteger(columns) && columns > 0 ? Math.min(columns, MAX_CHARS) : 40, region: any[] = [dim('─'.repeat(ruleWidth))]
  if (card.kind === 'loading') region.push(dim(`Reading ${card.name}…`)); if (card.kind === 'error') region.push(red(card.message)); if (card.kind === 'shown') { const { title, status, priority } = card.header, body = bounded(card.body), ac = acLabel(card.body); region.push(Text({ bold: true, children: [safe(title ?? card.name)] })); region.push(Text({ children: [dim('status: '), span(status ?? '—', statusColor(status)), dim(' · priority: '), span(priority ?? '—', priorityColor(priority)), ...(ac ? [dim(' · '), span(ac)] : [])] })); if (card.vizRoot && e.surface === 'terminal') { region.push(Button({ key: 'open-in-browser', label: 'Open in browser', onPress: () => { void openInBrowser($).catch(() => {}) } }), ...browserLines(card.browser).map(line)) }; if (body.clippedFrom !== null) region.push(dim(`Clipped: showing ${body.text.length} of ${body.clippedFrom} characters.`)); for (const part of bodyParts(card.segments, card.diagrams)) { if ('markdown' in part) region.push(Markdown({ text: safe(part.markdown) })); else { const diagram = bounded(part.diagram); if (diagram.clippedFrom !== null) region.push(dim(`Clipped: showing ${diagram.text.length} of ${diagram.clippedFrom} characters.`)); region.push(Code({ source: diagram.text, wrap: 'truncate-end' })) } } }
  children.push(Box({ flexDirection: 'column', marginTop: 1, children: region })); return Box({ flexDirection: 'column', children })
}
export function register(on: On) { on('session.start', async ($, e, next) => { try { await $.command.register({ name: 'issue', description: 'Show an obw dashboard view or card in a pane', argumentHint: '[view|card]', immediate: true }) } catch {} return next(e) }); on('command.run', { command: 'issue' }, async ($, e) => { const argument = (e.args ?? '').trim(), request = ++requests; view = LOADING; try { await $.ui.open(PANE) } catch { return { text: 'obw: the /issue pane could not open.' } }; await openIssue($, request, argument); return {} }); on('ui.render', { component: 'Pane' }, async ($, e, next) => { if (e.requestId !== PANE.id) return next(e); try { return await drawPane($, e) } catch { try { const { Text } = await $.ui.resolve(e); return Text({ dimColor: true, children: ['obw: the card could not be drawn.'] }) } catch { return next(e) } } }) }
