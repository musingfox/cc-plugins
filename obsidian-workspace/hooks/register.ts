import type { On } from 'claude-code'
import { bounded } from './bounds.ts'
import { configOf } from './config.ts'
import { listArgv, cardArgv, isBadCardName } from './argv.ts'
import { searchOutput, readOutput, OBSIDIAN_TIMEOUT_MS } from './cli-output.ts'
import type { Run } from './cli-output.ts'
import { headerOf } from './card.ts'
import type { CardHeader } from './card.ts'
import { vizManifestPath, vizInstallPath, renderTarget, renderArgv, renderOutcome, RENDER_TIMEOUT_MS } from './viz.ts'
import { splitFences, termaidHeaderAllowed, diagramOutcome, TERMAID_ARGV, TERMAID_TIMEOUT_MS } from './mermaid.ts'

const PANE = { id: 'obw-issue', title: 'obw issue', focus: true, closeOnEscape: true }

type Browser = { kind: 'rendering' } | ReturnType<typeof renderOutcome>

// The card region under the list has its own state, so a card's outcome never replaces the list's message.
// `diagrams` is indexed by a block's ordinal among the mermaid blocks of the clipped body.
type CardRegion =
  | { kind: 'loading'; name: string }
  | { kind: 'error'; message: string }
  | {
      kind: 'shown'
      name: string
      header: CardHeader
      body: string
      vizRoot: string | null
      browser: Browser | null
      diagrams: (string | undefined)[]
    }

type View = {
  message: string | null
  scope: { vault: string; project: string } | null
  cards: string[]
  selected: string | null
  card: CardRegion | null
}

const LOADING: View = { message: 'Reading the vault…', scope: null, cards: [], selected: null, card: null }

let view: View = LOADING
// A CLI call can settle after a newer /issue or card read started; only the latest request writes the view.
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
  if (request !== requests) return
  view = { ...LOADING, message }
  invalidate($)
}

function showCard($: any, request: number, name: string, card: CardRegion) {
  if (request !== requests) return
  view = { ...view, selected: name, card }
  invalidate($)
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

async function show($: any, name: string) {
  const { scope } = view
  if (!scope) return
  const request = ++requests
  const built = cardArgv(scope.vault, scope.project, name)
  if (!('argv' in built)) {
    return showCard($, request, name, { kind: 'error', message: `"${name}" is not a card name.` })
  }
  showCard($, request, name, { kind: 'loading', name })
  const output = readOutput(await runProcess($, built.argv))
  if (output.kind === 'error') return showCard($, request, name, { kind: 'error', message: output.message })
  const vizRoot = await findViz($)
  const header = headerOf(output.frontmatter)
  showCard($, request, name, { kind: 'shown', name, header, body: output.body, vizRoot, browser: null, diagrams: [] })
  // termaid never holds /issue: an offline uvx can take seconds, and the card is already drawn.
  void drawDiagrams($, request, bounded(output.body).text).catch(() => {})
}

// One run at a time: a rejected run means uvx fails for every block, and a superseded read never draws.
async function drawDiagrams($: any, request: number, body: string) {
  const sources = splitFences(body).flatMap((segment) => (segment.kind === 'mermaid' ? [segment.source] : []))
  for (const [ordinal, source] of sources.entries()) {
    if (!termaidHeaderAllowed(source)) continue
    if (request !== requests) return
    const run = await runProcess($, TERMAID_ARGV, TERMAID_TIMEOUT_MS, source)
    if (run.kind === 'rejected') return
    const diagram = diagramOutcome(run)
    if (diagram !== null) showDiagram($, request, ordinal, diagram)
  }
}

function showDiagram($: any, request: number, ordinal: number, diagram: string) {
  const card = view.card
  if (request !== requests || card?.kind !== 'shown') return
  const diagrams = [...card.diagrams]
  diagrams[ordinal] = diagram
  view = { ...view, card: { ...card, diagrams } }
  invalidate($)
}

// A press result writes only under the card read it was pressed on: a newer read, even of the same card, drops it.
function showBrowser($: any, request: number, browser: Browser) {
  const card = view.card
  if (request !== requests || card?.kind !== 'shown') return
  view = { ...view, card: { ...card, browser } }
  invalidate($)
}

async function openInBrowser($: any) {
  const card = view.card
  if (card?.kind !== 'shown' || !card.vizRoot) return
  const request = requests
  const target = renderTarget(card.name)
  showBrowser($, request, { kind: 'rendering' })
  try {
    await $.fs.write(target.file, card.body)
  } catch (error) {
    return showBrowser($, request, { kind: 'error', message: `Could not write ${target.file}: ${reasonOf(error)}` })
  }
  const run = await runProcess($, renderArgv(card.vizRoot, target), RENDER_TIMEOUT_MS)
  showBrowser($, request, renderOutcome(run))
}

// A block without a drawn diagram stays inside the markdown around it, so a pending or failed block reads as code.
function bodyParts(text: string, diagrams: (string | undefined)[]): ({ markdown: string } | { diagram: string })[] {
  if (!diagrams.some((diagram) => diagram !== undefined)) return [{ markdown: text }]
  const parts: ({ markdown: string } | { diagram: string })[] = []
  let markdown = ''
  let ordinal = 0
  for (const segment of splitFences(text)) {
    const diagram = segment.kind === 'mermaid' ? diagrams[ordinal++] : undefined
    if (diagram === undefined) {
      markdown += segment.text
      continue
    }
    if (markdown) parts.push({ markdown })
    markdown = ''
    parts.push({ diagram })
  }
  if (markdown) parts.push({ markdown })
  return parts
}

function browserLines(browser: Browser | null): string[] {
  if (browser?.kind === 'rendering') return ['Rendering in the browser…']
  if (browser?.kind === 'error') return [browser.message]
  if (browser?.kind !== 'opened') return []
  // Over SSH render.sh opens nothing and prints a URL instead.
  return browser.url ? [`Rendered: ${browser.path}`, `URL: ${browser.url}`] : [`Opened in the browser: ${browser.path}`]
}

type Config = { vault: string; project: string; path: string } | { error: string }

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

function reasonOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function openIssue($: any, request: number, card: string) {
  if (card && isBadCardName(card)) return showMessage($, request, `"${card}" is not a card name.`)
  let config: Config
  try {
    config = await resolveConfig($)
  } catch (error) {
    return showMessage($, request, `Could not look for .obsidian.yaml: ${reasonOf(error)}`)
  }
  if ('error' in config) return showMessage($, request, config.error)
  const list = listArgv(config.vault, config.project)
  if (!('argv' in list)) {
    return showMessage($, request, `${config.path}: pm.project "${config.project}" cannot name a folder under pm/.`)
  }
  const result = searchOutput(await runProcess($, list.argv), config.project)
  if (request !== requests) return
  if (result.kind === 'error') return showMessage($, request, result.message)
  view = {
    message: result.kind === 'empty' ? `No unfinished cards in pm/${config.project}.` : null,
    scope: { vault: config.vault, project: config.project },
    cards: result.kind === 'cards' ? result.cards : [],
    selected: card || null,
    card: null,
  }
  invalidate($)
  if (card) await show($, card)
}

async function drawPane($: any, e: any) {
  const { Box, Text, Select, Markdown, Button, Code } = await $.ui.resolve(e)
  const safe = (text: string) => bounded(text).text
  const dim = (text: string) => Text({ dimColor: true, children: [safe(text)] })
  const clipNotice = (shown: string, clippedFrom: number) => dim(`Clipped: showing ${shown.length} of ${clippedFrom} characters.`)
  const children: any[] = []
  if (view.cards.length) {
    children.push(
      Select({
        key: 'cards',
        options: view.cards.map((card) => ({ value: safe(card), label: safe(card) })),
        ...(view.selected ? { value: safe(view.selected) } : {}),
        onSelect: (value: string) => {
          void show($, value).catch(() => {})
        },
      }),
    )
  }
  if (view.message) children.push(dim(view.message))
  const card = view.card
  if (card?.kind === 'loading') children.push(dim(`Reading ${card.name}…`))
  if (card?.kind === 'error') children.push(dim(card.message))
  if (card?.kind === 'shown') {
    const { title, status, priority } = card.header
    const body = bounded(card.body)
    children.push(Text({ bold: true, children: [safe(title ?? card.name)] }))
    children.push(dim(`status: ${status ?? '—'} · priority: ${priority ?? '—'}`))
    // Only the terminal can run render.sh: `process` is CLI only.
    if (card.vizRoot && e.surface === 'terminal') {
      children.push(
        Button({
          key: 'open-in-browser',
          label: 'Open in browser',
          onPress: () => {
            void openInBrowser($).catch(() => {})
          },
        }),
      )
      for (const line of browserLines(card.browser)) children.push(dim(line))
    }
    if (body.clippedFrom !== null) children.push(clipNotice(body.text, body.clippedFrom))
    for (const part of bodyParts(body.text, card.diagrams)) {
      if ('markdown' in part) {
        children.push(Markdown({ text: part.markdown }))
        continue
      }
      const diagram = bounded(part.diagram)
      if (diagram.clippedFrom !== null) children.push(clipNotice(diagram.text, diagram.clippedFrom))
      children.push(Code({ source: diagram.text, wrap: 'truncate-end' }))
    }
  }
  return Box({ flexDirection: 'column', children })
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'issue',
        description: 'Show an obw task card in a pane',
        argumentHint: '[card]',
        immediate: true,
      })
    } catch {
      // A refused /issue must not stop the session.
    }
    return next(e)
  })

  on('command.run', { command: 'issue' }, async ($, e) => {
    const card = (e.args ?? '').trim()
    const request = ++requests
    view = LOADING
    try {
      await $.ui.open(PANE)
    } catch {
      return { text: 'obw: the /issue pane could not open.' }
    }
    await openIssue($, request, card)
    // Card text never goes into the result: the model would read it.
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
