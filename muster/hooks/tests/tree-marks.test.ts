import { expect, test } from 'claude-code/testing'
import { nodesOf, stringsIn } from './fixtures/band.ts'
import { NOW, RUNS, SESSION, dir, file, kitWorld } from './fixtures/world.ts'
import { drawnKeys, issueKey, runKey } from '../tree-model.ts'

const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()
const meta = (extra: object = {}, started = ago(100)) => JSON.stringify({ name: 'x', repoRoot: '/r', started, ...extra })
const line = (value: object) => JSON.stringify(value)
const update = (value: object) => line({ t: 't', dir: 'in', msg: { method: 'session/update', params: { update: value } } })

const PANE = {
  component: 'Pane',
  surface: 'terminal',
  requestId: 'muster-tree',
  viewport: { columns: 160, rows: 40 },
  props: { title: 'muster', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const ISSUE = 'https://example.com/I'
// In issue I, oldest first: a is blocked with a plan, words and a refused permission; b runs with a plan; d is done.
// c has no issue and exited on the idle timeout.
const WORLD = {
  dirs: {
    [RUNS]: [dir('a'), dir('b'), dir('c'), dir('d')],
    [`${RUNS}/a`]: [file('REPORT.md'), file('events.jsonl')],
    [`${RUNS}/b`]: [],
    [`${RUNS}/c`]: [],
    [`${RUNS}/d`]: [file('REPORT.md')],
  },
  files: {
    [`${RUNS}/a/meta.json`]: meta({ issue: ISSUE }, ago(300)),
    [`${RUNS}/a/phase.json`]: line({ phase: 'idle', title: 'Build A' }),
    [`${RUNS}/a/REPORT.md`]: 'BLOCKED\nthe fixture is missing',
    [`${RUNS}/a/events.jsonl`]: [
      update({ sessionUpdate: 'plan', entries: [{ status: 'completed', content: 'Read', priority: 'medium' }, { status: 'in_progress', content: 'Wire', priority: 'medium' }, { status: 'pending', content: 'Ship', priority: 'medium' }] }),
      update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Looking for the fixture.' } }),
      line({ t: 't', dir: 'client-decision', msg: { decision: 'deny', by: 'policy' } }),
    ].join('\n'),
    [`${RUNS}/b/meta.json`]: meta({ issue: ISSUE }, ago(200)),
    [`${RUNS}/b/phase.json`]: line({ phase: 'running', title: 'Build B', plan: { done: 2, total: 5 }, tools: 4 }),
    [`${RUNS}/c/meta.json`]: meta({}, ago(50)),
    [`${RUNS}/c/phase.json`]: line({ phase: 'exited', reason: 'idle-timeout', title: 'Probe C', tools: 7 }),
    [`${RUNS}/d/meta.json`]: meta({ issue: ISSUE }, ago(100)),
    [`${RUNS}/d/phase.json`]: line({ phase: 'idle', title: 'Build D' }),
    [`${RUNS}/d/REPORT.md`]: 'DONE\nok',
  },
}

async function openPane($: any, on: any, select: string[] = []) {
  const w = kitWorld(on, WORLD)
  on('command.register', () => ({ value: { command: 'muster-runs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start(SESSION)
  await w.clock.settle()
  await $.ui.render(PANE)
  for (const name of select) await $.ui.press({ plugin: 'muster', key: runKey(name) })
  return $.ui.render(PANE)
}

const textOf = (node: any) => stringsIn(node).join('')
const childrenOf = (node: any) => node?.props?.children ?? node?.children ?? []
// A run row is the Box whose third child holds the run's name Button.
const rowOf = (tree: any, name: string) => nodesOf(tree, 'Box').find((box) => childrenOf(box).length === 6 && textOf(childrenOf(box)[2]) === name)
// Detail lines hang in Boxes of a connector Text and the line itself.
const leavesOf = (tree: any) => nodesOf(tree, 'Box').filter((box) => /^(│  | {3})[├└]─$/.test(textOf(childrenOf(box)[0]) ?? ''))

test('TreeMarks M1 the header is a bold muster then a coloured glyph and count for each state present, with no state words', async ($, on) => {
  const tree = await openPane($, on)
  const header = nodesOf(tree, 'Box').find((box) => textOf(childrenOf(box)[0]) === 'muster')
  expect(childrenOf(header)[0].props.weight).toBe('bold')
  expect(childrenOf(header).slice(1).map((node: any) => [textOf(node), node.props.color])).toEqual([
    ['● 1', 'suggestion'],
    ['√ 1', 'success'],
    ['× 1', 'error'],
  ])
  const joined = stringsIn(tree).join(' ')
  for (const word of ['running', 'blocked', 'done', 'question']) expect(joined).not.toContain(word)
})

test('TreeMarks M2 an issue header is ▼ when open and ► when folded, the folded one trailing its runs\' glyphs dim, and the open Button is →', async ($, on) => {
  const open = await openPane($, on)
  const head = (tree: any) => nodesOf(tree, 'Box').find((box) => childrenOf(box).some((kid: any) => kid.props?.label === ISSUE))
  expect(textOf(childrenOf(head(open))[0])).toBe('▼')
  const opened = childrenOf(head(open))
  expect(opened.map((kid: any) => kid.props?.label).filter(Boolean)).toEqual([ISSUE, '→'])
  await $.ui.press({ plugin: 'muster', key: issueKey(ISSUE) })
  const folded = head(await $.ui.render(PANE))
  expect(textOf(childrenOf(folded)[0])).toBe('►')
  const glyphs = childrenOf(folded)[2]
  expect(textOf(glyphs)).toBe('×●√')
  expect(glyphs.props.dimColor).toBe(true)
  expect(childrenOf(folded).map((kid: any) => kid.props?.label).filter(Boolean)).toEqual([ISSUE, '→'])
})

test('TreeMarks M3 a run row is connector, coloured glyph, a 16-wide name Button, a growing title, a right-aligned progress and elapsed', async ($, on) => {
  const tree = await openPane($, on)
  const [a, b, d, c] = ['a', 'b', 'd', 'c'].map((name) => childrenOf(rowOf(tree, name)))
  expect([a, b, d].map((cells) => textOf(cells[0]))).toEqual(['├─', '├─', '└─'])
  expect(textOf(c[0])).toBe('└─')
  expect([a, b, c, d].map((cells) => [textOf(cells[1]), cells[1].props.color])).toEqual([
    ['×', 'error'],
    ['●', 'suggestion'],
    ['■', 'inactive'],
    ['√', 'success'],
  ])
  expect(b[2].props.width).toBe(16)
  expect(b[3].props.flexGrow).toBe(1)
  expect(childrenOf(b[3])[0].props.wrap).toBe('truncate-end')
  expect(textOf(b[3])).toBe('Build B')
  expect(textOf(c[3])).toBe('Probe C → idle-timeout')
  expect(childrenOf(childrenOf(c[3])[0]).at(-1).props.dimColor).toBe(true)
  expect(textOf(b[4])).toBe('██░░░ 2/5')
  expect(textOf(c[4])).toBe('# 7')
  for (const cells of [b, c]) {
    expect(cells[4].props.justifyContent).toBe('flex-end')
    expect(cells[5].props.justifyContent).toBe('flex-end')
  }
  expect(textOf(b[5])).toBe('3m')
})

test('TreeMarks M4 the selected run\'s detail hangs under it, each line behind the trunk and a connector, the hand-off Button last', async ($, on) => {
  const tree = await openPane($, on, ['a'])
  const leaves = leavesOf(tree)
  const shown = leaves.map((leaf) => [textOf(childrenOf(leaf)[0]), textOf(childrenOf(leaf)[1])])
  expect(shown).toEqual([
    ['│  ├─', '¶ BLOCKED'],
    ['│  ├─', '× the fixture is missing'],
    ['│  ├─', '≡ ██░░░ 1/3'],
    ['│  ├─', '√ Read'],
    ['│  ├─', '► Wire'],
    ['│  ├─', '· Ship'],
    ['│  ├─', '» Looking for the fixture.'],
    ['│  ├─', 'ø permission deny by policy'],
    ['│  └─', '› ask coordinator'],
  ])
  expect(childrenOf(childrenOf(leaves.at(-1))[1])[0].props.label).toBe('› ask coordinator')
})

test('TreeMarks M5 under the last run of an issue the trunk is blank, and a report not yet written reads —', async ($, on) => {
  const tree = await openPane($, on, ['c'])
  const shown = leavesOf(tree).map((leaf) => [textOf(childrenOf(leaf)[0]), textOf(childrenOf(leaf)[1])])
  expect(shown).toEqual([
    ['   ├─', '¶ —'],
    ['   ├─', '· nothing yet'],
    ['   └─', '› ask coordinator'],
  ])
})

test('TreeMarks M6 the footer reads the new keys', async ($, on) => {
  expect(stringsIn(await openPane($, on))).toContain('↑↓ move · enter fold, detail, open, ask · esc close')
})

test('TreeMarks M7 drawnKeys lists the Buttons the pane draws, in drawn order', async ($, on) => {
  const tree = await openPane($, on, ['a'])
  const keys = nodesOf(tree, 'Button').map((button) => button.props?.key ?? button.key)
  expect(keys).toEqual([issueKey(ISSUE), `open:${ISSUE}`, 'run:a', 'ask:a', 'run:b', 'run:d', issueKey(null), 'run:c'])
  const groups = [
    { issue: ISSUE, runs: ['a', 'b', 'd'].map((name) => ({ name })) },
    { issue: null, runs: [{ name: 'c' }] },
  ] as any
  expect(drawnKeys(groups, [], 'a', true)).toEqual(keys)
})
