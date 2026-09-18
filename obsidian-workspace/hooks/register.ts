import type { On } from 'claude-code'
import { bounded } from './bounds.ts'
import { configOf } from './config.ts'
import { listArgv, cardArgv, cardNameProblem } from './argv.ts'
import { searchOutput, readOutput, type Run } from './cli-output.ts'
import { headerOf } from './card.ts'

const PANE = { id: 'obw-issue', title: 'obw issue', focus: true, closeOnEscape: true }
const TIMEOUT = 10000
type Card = { name: string; title?: string; status?: string; priority?: string; body: string } | null
type View = { phase: 'loading' | 'message' | 'list'; message?: string; project?: string; vault?: string; cards?: string[]; selected?: string; card?: Card; cardLoading?: boolean }
let view: View = { phase: 'loading' }

async function runObsidian($: any, argv: string[]): Promise<Run> { try { const result = await $.process.run(argv, { timeoutMs: TIMEOUT }); return { kind: 'exited', exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr } } catch { return { kind: 'rejected' } } }
function invalidate($: any) { $.ui.invalidate('ui.render') }
async function show($: any, name: string) {
  if (!view.vault || !view.project) return
  view = { ...view, selected: name, card: null, cardLoading: true }; invalidate($)
  const built = cardArgv(view.vault, view.project, name)
  if (!('argv' in built)) { view = { ...view, cardLoading: false, card: null, message: `"${name}" is not a card name.` }; invalidate($); return }
  const output = readOutput(await runObsidian($, built.argv))
  if (output.kind === 'error') view = { ...view, cardLoading: false, card: null, message: output.message }
  else { const header = headerOf(output.frontmatter); view = { ...view, cardLoading: false, message: undefined, card: { name, ...header, body: output.body } } }
  invalidate($)
}
async function resolveConfig($: any): Promise<{ vault: string; project: string; path: string } | { error: string }> {
  const cwd = await $.session.cwd(); let dir = cwd
  while (true) { const path = `${dir}/.obsidian.yaml`; let exists = false; try { exists = await $.fs.exists({ path }) } catch {} if (exists) { let text: string; try { text = await $.fs.read({ path }) } catch { return { error: `Could not read ${path}.` } }; const { vault, project } = configOf(text); if (!vault && !project) return { error: `${path} has no vault or pm.project.` }; if (!vault) return { error: `${path} has no vault.` }; if (!project) return { error: `${path} has no pm.project.` }; return { vault, project, path } } if (dir === '/') break; dir = dir.slice(0, dir.lastIndexOf('/')) || '/' }
  return { error: `No .obsidian.yaml in ${cwd} or any directory above it.` }
}

export function register(on: On) {
  on('session.start', async ($, e, next) => { try { await $.command.register({ name: 'issue', description: 'Show an obw task card in a pane', argumentHint: '[card]', immediate: true }) } catch {} return next(e) })
  on('command.run', { command: 'issue' }, async ($, e) => {
    const card = (e.args ?? '').trim(); view = { phase: 'loading', message: 'Reading the vault…' }
    try { await $.ui.open(PANE) } catch { return { text: 'obw: the /issue pane could not open.' } }
    if (card && cardNameProblem(card)) { view = { phase: 'message', message: `"${card}" is not a card name.` }; invalidate($); return {} }
    const config = await resolveConfig($)
    if ('error' in config) { view = { phase: 'message', message: config.error }; invalidate($); return {} }
    const list = listArgv(config.vault, config.project)
    if (!('argv' in list)) { view = { phase: 'message', message: `${config.path}: pm.project "${config.project}" cannot name a folder under pm/.` }; invalidate($); return {} }
    const result = searchOutput(await runObsidian($, list.argv), config.project)
    if (result.kind === 'error') { view = { phase: 'message', message: result.message }; invalidate($); return {} }
    view = { phase: 'list', vault: config.vault, project: config.project, cards: result.kind === 'cards' ? result.cards : [], selected: card || undefined, message: result.kind === 'empty' ? `No unfinished cards in pm/${config.project}.` : undefined }
    invalidate($)
    if (card) await show($, card)
    return {}
  })
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== 'obw-issue') return next(e)
    try {
      const { Box, Text, Select, Markdown } = await $.ui.resolve(e); const safe = (s: string) => bounded(s).text; const children: any[] = []
      if (view.phase === 'loading') children.push(Text({ dimColor: true, children: [safe(view.message ?? 'Reading the vault…')] }))
      else {
        if (view.cards?.length) children.push(Select({ key: 'cards', options: view.cards.map(c => ({ value: safe(c), label: safe(c) })), ...(view.selected ? { value: safe(view.selected) } : {}), onSelect: (value: string) => { void show($, value).catch(() => {}) } }))
        if (view.message) children.push(Text({ dimColor: true, children: [safe(view.message)] }))
        if (view.cardLoading && view.selected) children.push(Text({ dimColor: true, children: [safe(`Reading ${view.selected}…`)] }))
        if (view.card) { const title = safe(view.card.title ?? view.card.name); const status = safe(view.card.status ?? '—'); const priority = safe(view.card.priority ?? '—'); const body = bounded(view.card.body); children.push(Text({ bold: true, children: [title] }), Text({ dimColor: true, children: [safe(`status: ${status} · priority: ${priority}`)] })); if (body.clippedFrom !== null) children.push(Text({ dimColor: true, children: [safe(`Clipped: showing ${body.text.length} of ${body.clippedFrom} characters.`)] })); children.push(Markdown({ text: body.text })) }
      }
      return Box({ flexDirection: 'column', children })
    } catch { try { const { Text } = await $.ui.resolve(e); return Text({ dimColor: true, children: ['obw: the card could not be drawn.'] }) } catch { return next(e) } }
  })
}
