import { CONFIG, SESSION, manifest, world } from './world.ts'

export const PANE = { component: 'Pane', surface: 'terminal', requestId: 'obw-issue', viewport: { columns: 160, rows: 40 }, props: { title: 'obw issue', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} } } as const

// Every string drawn: Text children, Markdown text, Select option values and labels.
export function stringsIn(node: any): string[] {
  if (typeof node === 'string') return node === '' ? [] : [node]
  if (!node || typeof node !== 'object') return []
  const options = (node.props?.options ?? []).flatMap((option: any) => [option.value, option.label])
  return [...(node.children ?? []), ...(node.props?.children ?? []), node.props?.text, ...options].flatMap(stringsIn)
}

export function nodesOf(node: any, type: string): any[] {
  if (!node || typeof node !== 'object') return []
  const kids = [...(node.children ?? []), ...(node.props?.children ?? [])]
  return [...(node.type === type ? [node] : []), ...kids.flatMap((kid) => nodesOf(kid, type))]
}

export async function issue($: any, args: string) {
  await $.session.start(SESSION)
  return $.command.run({ command: 'issue', args })
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
