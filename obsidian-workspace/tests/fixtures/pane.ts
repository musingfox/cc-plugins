import { expect } from 'claude-code/testing'
import { BACK_KEY, QUERY_KEY } from '../../hooks/ring.ts'
import { CONFIG, SESSION, kindOf, manifest, world } from './world.ts'

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

// The Open in browser Buttons: a terminal argument card also carries Bind and Unbind Buttons.
export const browserButtons = (tree: any) => nodesOf(tree, 'Button').filter((node: any) => node.props.key === 'open-in-browser')

// The header line: one Text whose spans read `status: … · priority: …`.
export function headerIn(tree: any) {
  return nodesOf(tree, 'Text').find((node) => stringsIn(node).join('').startsWith('status: '))
}

// The line the pane's ui.render catch draws in place of the whole tree.
export const REFRESH_HINT =
  'pm/cc-plugins/dashboard.base has no All Tasks view. Run /obw:pm refresh dashboard to regenerate it from the plugin template; hand edits to that file are overwritten.'

export const NOT_DRAWN = 'obw: the card could not be drawn.'
// The pane drew itself: a tree that holds that line is the catch's, whatever its root element is.
export const expectDrawn = (tree: any) => expect(stringsIn(tree)).not.toContain(NOT_DRAWN)

// The pane draws the view picker first and the card picker second; either may be absent.
export const viewSelect = (tree: any) => nodesOf(tree, 'Select').find((node: any) => node.props.key === 'views')
export const cardSelect = (tree: any) => nodesOf(tree, 'Select').find((node: any) => node.props.key === 'cards')
// Every Button in drawing order: its key, its label and its props. `stringsIn` leaves Button labels out.
export const buttonsIn = (tree: any) => nodesOf(tree, 'Button')
// The card's own action Buttons: the card view's `back` is chrome, not an action.
export const actionButtons = (tree: any) => buttonsIn(tree).filter((node: any) => node.props.key !== BACK_KEY)
export const buttonOf = (tree: any, key: string) => buttonsIn(tree).find((node: any) => node.props.key === key)
// The element that holds the Button as a direct child: a heading's or a row's own line.
export const lineOf = (tree: any, key: string) =>
  elementsIn(tree).find((node: any) => [...(node.children ?? []), ...(node.props?.children ?? [])].some((kid: any) => kid?.props?.key === key))
export const rowKeys = (tree: any) => buttonsIn(tree).map((node: any) => node.props.key).filter((key: string) => key.startsWith('row:'))
export const headingKeys = (tree: any) => buttonsIn(tree).map((node: any) => node.props.key).filter((key: string) => key.startsWith('group:'))
export const labelsOf = (nodes: any[]) => nodes.map((node: any) => node.props.label)

// Every `color` and `backgroundColor` prop in the tree, with the element that carries it.
export function colorsIn(node: any): { type: string; prop: string; value: unknown }[] {
  if (!node || typeof node !== 'object') return []
  const own = ['color', 'backgroundColor'].filter((prop) => node.props && prop in node.props).map((prop) => ({ type: node.type, prop, value: node.props[prop] }))
  return [...own, ...[...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(colorsIn)]
}

// Runs by their verb, so an added obsidian call cannot shift an assertion off its target.
export const runsOf = (w: any, verb: string) => w.runs.filter((run: any) => run.argv[0] === 'obsidian' && kindOf(run.argv) === verb)
export const uvxRuns = (w: any) => w.runs.filter((run: any) => run.argv[0] === 'uvx')
export const renderRuns = (w: any) => w.runs.filter((run: any) => run.argv[0] === 'bash')

// The pane mounted: $.ui.render only draws, a mounted pane also takes the picks and presses a user makes.
export const mounted = ($: any, { surface = 'terminal', props = PANE.props }: { surface?: string; props?: any } = {}) =>
  $.ui.mount({ plugin: 'obw', surface, component: 'Pane', props, requestId: PANE.requestId, viewport: PANE.viewport })

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

// A pick of a Select option, which only a mounted drawing takes; the pick's async work finishes on settle.
export async function pick($: any, w: any, key: string, value: string) {
  const picked = await (await mounted($)).select({ plugin: 'obw', key, value })
  await w.clock.settle()
  return picked
}

// The kit presses only a Button a render has drawn; the press's async work finishes on settle.
export async function press($: any, w: any, key = PRESS.key) {
  await $.ui.render(PANE)
  const pressed = await $.ui.press({ plugin: 'obw', key })
  await w.clock.settle()
  return pressed
}

// Opens All Tasks and presses its first row; the card read finishes on settle.
export async function openFirstRow($: any, w: any) {
  await issue($, '')
  const [first] = rowKeys(await $.ui.render(PANE))
  await pressKey($, w, first)
}

// A press of any Button of the drawn pane; the press's async work finishes on settle.
export async function pressKey($: any, w: any, key: string) {
  await $.ui.render(PANE)
  const pressed = await $.ui.press({ plugin: 'obw', key })
  await w.clock.settle()
  return pressed
}

// Types into the filter Input as an edit, or as Enter when `kind` is submit.
export async function typeQuery($: any, w: any, text: string, kind: 'change' | 'submit' = 'change') {
  await $.ui.render(PANE)
  const typed = await $.ui.input({ plugin: 'obw', key: QUERY_KEY, text, kind })
  await w.clock.settle()
  return typed
}

// The kit's `$` has no `state`, so obw's values are watched where they are written: each write of
// obw's pane, list and ring reaches the test's own `state.set` hook before it lands.
export function watchState(on: any) {
  const writes: Record<string, any[]> = { pane: [], list: [], ring: [] }
  for (const key of Object.keys(writes)) {
    on('state.set', { plugin: 'obw', key }, async ($: any, e: any, next: any) => {
      writes[key].push(e.value)
      return next(e)
    })
  }
  return {
    writes,
    // What stands under the key: a `pane` write is Shaped, so its drawn value is the one inside the tag.
    latest: (key: 'pane' | 'list' | 'ring') => (key === 'pane' ? writes.pane.at(-1)?.value : writes[key].at(-1)),
  }
}
