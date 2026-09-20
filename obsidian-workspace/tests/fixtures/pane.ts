import { CONFIG, SESSION, manifest, world } from './world.ts'

export const PANE = { component: 'Pane', surface: 'terminal', requestId: 'obw-issue', viewport: { columns: 160, rows: 40 }, props: { title: 'obw issue', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} } } as const

// Every string drawn: Text children, Markdown text, Code source, Select option values and labels.
export function stringsIn(node: any): string[] {
  if (typeof node === 'string') return node === '' ? [] : [node]
  if (!node || typeof node !== 'object') return []
  const options = (node.props?.options ?? []).flatMap((option: any) => [option.value, option.label])
  return [...(node.children ?? []), ...(node.props?.children ?? []), node.props?.text, node.props?.source, ...options].flatMap(stringsIn)
}

// Every element in drawing order.
export function elementsIn(node: any): any[] {
  if (!node || typeof node !== 'object') return []
  return [node, ...[...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(elementsIn)]
}

export function nodesOf(node: any, type: string): any[] {
  if (!node || typeof node !== 'object') return []
  const kids = [...(node.children ?? []), ...(node.props?.children ?? [])]
  return [...(node.type === type ? [node] : []), ...kids.flatMap((kid) => nodesOf(kid, type))]
}

// The header line: one Text whose spans read `status: … · priority: …`.
export function headerIn(tree: any) {
  return nodesOf(tree, 'Text').find((node) => stringsIn(node).join('').startsWith('status: '))
}

// The pane draws the view picker first and the card picker second; either may be absent.
export const viewSelect = (tree: any) => nodesOf(tree, 'Select').find((node: any) => node.props.key === 'views')
export const cardSelect = (tree: any) => nodesOf(tree, 'Select').find((node: any) => node.props.key === 'cards')

// Runs by their verb, so an added obsidian call cannot shift an assertion off its target.
export const runsOf = (w: any, verb: string) => w.runs.filter((run: any) => run.argv[0] === 'obsidian' && run.argv[2] === verb)
export const uvxRuns = (w: any) => w.runs.filter((run: any) => run.argv[0] === 'uvx')
export const renderRuns = (w: any) => w.runs.filter((run: any) => run.argv[0] === 'bash')

export async function issue($: any, args: string) {
  await $.session.start(SESSION)
  return $.command.run({ command: 'issue', args })
}

// /issue with its reads and runs settled.
export async function shown($: any, w: any, card: string) {
  await issue($, card)
  await w.clock.settle()
}

export const HOME_MANIFEST = '/Users/u/.claude/plugins/installed_plugins.json'
export const CONFIG_PATH = '/work/.obsidian.yaml'
export const ROOT = '/Users/u/.claude/plugins/cache/m/viz/1.1.4'
export const PRESS = { plugin: 'obw', key: 'open-in-browser' }

// A world where HOME finds one user-scope viz install at ROOT.
export function vizWorld(on: any, options: any = {}) {
  return world(on, { env: { HOME: '/Users/u' }, files: { [CONFIG_PATH]: CONFIG, [HOME_MANIFEST]: manifest(ROOT) }, ...options })
}

// The kit presses only a Button a render has drawn; the press's async work finishes on settle.
export async function press($: any, w: any) {
  await $.ui.render(PANE)
  const pressed = await $.ui.press(PRESS)
  await w.clock.settle()
  return pressed
}
