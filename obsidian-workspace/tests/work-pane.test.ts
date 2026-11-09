import { expect, test } from 'claude-code/testing'
import { PANE, nodesOf, pressKey, shown, stringsIn } from './fixtures/pane.ts'
import { AB, world } from './fixtures/world.ts'
import { workPrompt } from '../hooks/register.ts'
import { ERROR as RED } from '../hooks/style.ts'

const A = 'pm/cc-plugins/tasks/a.md'
const B = 'pm/cc-plugins/tasks/b.md'
const TICK_MS = 5000
const keys = async ($: any) => nodesOf(await $.ui.render(PANE), 'Button').map((node: any) => node.props.key)
const SENT = (tree: any) => stringsIn(tree).filter((text) => text === 'Sent to Claude.')
const COULD_NOT_SEND = (tree: any) => stringsIn(tree).filter((text) => text.startsWith('Could not send: '))

// The kit raises prompt.submit to a test hook with the plugin's call as its event: { text } lets the submit succeed,
// and with no hook the submit rejects with the kit's own "no implementation for prompt.submit".
function submits(on: any, answer: (e: any) => any = (e) => ({ text: e.text })) {
  const calls: any[] = []
  on('prompt.submit', (_$: any, e: any) => {
    calls.push({ text: e.text, asUser: e.origin?.asUser })
    return answer(e)
  })
  return calls
}

const open = async ($: any, on: any, options: any = {}) => {
  const w = world(on, { query: AB, ...options })
  await shown($, w, 'a')
  return w
}

test('W1 a shown card on the terminal draws Work on this card and no bind Button', async ($, on) => {
  await open($, on)
  const tree = await $.ui.render(PANE)
  const work = nodesOf(tree, 'Button').filter((node: any) => node.props.key === 'work')
  expect(work).toHaveLength(1)
  expect(work[0].props.label).toBe('Work on this card')
  expect(await keys($)).not.toContain('bind')
})

test('W1 the desktop draws no Work button', async ($, on) => {
  await open($, on)
  expect(nodesOf(await $.ui.render({ ...PANE, surface: 'desktop' }), 'Button').map((node: any) => node.props.key)).not.toContain('work')
})

test('W2 the prompt text is pinned', () => {
  expect(workPrompt(A, 'obsidian')).toBe(
    'Work on the pm task card pm/cc-plugins/tasks/a.md in vault obsidian. Read it with the Obsidian CLI, then meet its acceptance criteria. Set its status with pm_status when you start and when you finish, and tick each criterion with pm_tick once you have verified it.',
  )
})

test('W2 W3 W4 pressing submits that text once as the user, writes no binding and leaves the pane open', async ($, on) => {
  const calls = submits(on)
  const w = await open($, on)
  const before = [...Object.keys(w.files)]
  await pressKey($, w, 'work')
  expect(calls).toEqual([{ text: workPrompt(A, 'obsidian'), asUser: true }])
  expect(w.writes).toEqual([])
  expect(Object.keys(w.files)).toEqual(before)
  expect(w.runs.filter((run: any) => run.argv[0] === 'rm')).toEqual([])
  expect(w.panes).toContain('obw-issue')
})

test('W5 the pressed card shows Sent to Claude. in place of the Button, and a second press sends nothing', async ($, on) => {
  const calls = submits(on)
  const w = await open($, on)
  await pressKey($, w, 'work')
  const tree = await $.ui.render(PANE)
  expect(SENT(tree)).toHaveLength(1)
  expect(await keys($)).not.toContain('work')
  await $.ui.press({ plugin: 'obw', key: 'work' }).catch(() => {})
  await w.clock.settle()
  expect(calls).toHaveLength(1)
})

test('W5 two presses before the submit settles send once', async ($, on) => {
  const calls = submits(on)
  const w = await open($, on)
  await $.ui.render(PANE)
  await Promise.all([$.ui.press({ plugin: 'obw', key: 'work' }), $.ui.press({ plugin: 'obw', key: 'work' }).catch(() => {})])
  await w.clock.settle()
  expect(calls).toHaveLength(1)
})

test('W5 another card still shows the Button', async ($, on) => {
  const calls = submits(on)
  const w = await open($, on)
  await pressKey($, w, 'work')
  await shown($, w, 'b')
  expect(await keys($)).toContain('work')
  expect(SENT(await $.ui.render(PANE))).toEqual([])
  await pressKey($, w, 'work')
  expect(calls.map((call: any) => call.text)).toEqual([workPrompt(A, 'obsidian'), workPrompt(B, 'obsidian')])
})

test('W5 /issue resets what was sent', async ($, on) => {
  submits(on)
  const w = await open($, on)
  await pressKey($, w, 'work')
  expect(SENT(await $.ui.render(PANE))).toHaveLength(1)
  await shown($, w, 'a')
  expect(SENT(await $.ui.render(PANE))).toEqual([])
  expect(await keys($)).toContain('work')
})

test('W5 a refresh tick keeps what was sent', async ($, on) => {
  const calls = submits(on)
  const w = await open($, on)
  await pressKey($, w, 'work')
  await w.clock.advance(TICK_MS)
  await w.clock.settle()
  expect(SENT(await $.ui.render(PANE))).toHaveLength(1)
  expect(await keys($)).not.toContain('work')
  expect(calls).toHaveLength(1)
})

test('W6 a rejected submit (no prompt.submit answer in the world) draws one error line under the card in red and brings the Button back', async ($, on) => {
  const w = await open($, on)
  await pressKey($, w, 'work')
  const tree = await $.ui.render(PANE)
  expect(COULD_NOT_SEND(tree)).toEqual(['Could not send: no implementation for prompt.submit'])
  expect(nodesOf(tree, 'Text').find((node: any) => stringsIn(node)[0]?.startsWith('Could not send: ')).props.color).toBe(RED)
  expect(SENT(tree)).toEqual([])
  expect(await keys($)).toContain('work')
  await pressKey($, w, 'work')
  expect(COULD_NOT_SEND(await $.ui.render(PANE))).toHaveLength(1)
  expect(await keys($)).toContain('work')
})
