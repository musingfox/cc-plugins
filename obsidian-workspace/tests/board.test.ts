import { expect, test } from 'claude-code/testing'
import Board from '../hooks/board.ts'
import { fakeSurface, linesOf, textsOf } from './fixtures/surface.ts'

const P = (name: string) => `pm/cc-plugins/tasks/${name}.md`
const row = (name: string, badge: string, fields: any = {}) => ({ path: P(name), badge, title: name, due: '', tags: '', ...fields })

// MIX (grouped.test.ts) as the pane hands it over: status groups in schema order, rows by priority.
const MIX_GROUPS = [
  { status: 'todo', count: 4, rows: [row('b', 'H'), row('a', 'M'), row('i', ' '), row('j', ' ')] },
  { status: 'in-progress', count: 1, rows: [row('c', 'L')] },
  { status: 'blocked', count: 1, rows: [row('d', ' ')] },
  { status: 'done', count: 2, rows: [row('f', 'H'), row('e', 'L')] },
  { status: 'waiting', count: 1, rows: [row('g', 'M')] },
  { status: null, count: 1, rows: [row('h', 'L')] },
]

const list = (fields: any = {}) => ({ rows: 20, columns: 40, groups: MIX_GROUPS, hidden: 0, card: null, ...fields })
const board = (props: any) => fakeSurface(Board, props)
const counter = (tree: any) => linesOf(tree)[0].split('  ').at(-1)

test('fits a row line to the width with aligned due and tags', () => {
  const groups = [{ status: 'todo', count: 1, rows: [row('x', 'H', { title: '中文標題很長的標題文字', due: '2026-09-30', tags: '#a, #b' })] }]
  expect(linesOf(board(list({ groups })).tree)[2]).toBe('  [H] 中文標題很長…   2026-09-30  #a, #b')
})

test('draws status headings with counts and the position counter', () => {
  const lines = linesOf(board(list()).tree)
  expect(lines[1]).toBe('▾ todo  4')
  expect(lines).toContain('▸ done  2')
  expect(lines).toContain('▾ —  1')
  expect(lines[0].endsWith('  1/14')).toBe(true)
})

test('ends with a dim count of rows left out', () => {
  const texts = textsOf(board(list({ hidden: 3 })).tree)
  expect(texts.at(-1).props.children).toEqual(['3 more not shown'])
  expect(texts.at(-1).props.dimColor).toBe(true)
})

test('drops the due and tags columns when no row has them', () => {
  const groups = [{ status: 'todo', count: 1, rows: [row('a', 'M')] }]
  expect(linesOf(board(list({ groups })).tree)[2]).toBe('  [M] a')
})

test('draws only the window of a large list within the tree bounds', () => {
  const rows = Array.from({ length: 100 }, (_, i) => row(`r${i}`, 'H', { title: 'x'.repeat(80) }))
  const tree = board(list({ rows: 150, columns: 300, groups: [{ status: 'todo', count: 100, rows }] })).tree
  expect(textsOf(tree).length).toBeLessThanOrEqual(150)
  expect(JSON.stringify(tree).length).toBeLessThan(100000)
})

const inverse = (tree: any) => linesOf({ props: { children: textsOf(tree).filter((text) => text.props.inverse) } })[0]

test('moves the cursor line down', () => {
  const s = board(list({ rows: 6 }))
  s.key('down'), s.key('down'), s.key('down')
  expect(counter(s.tree)).toBe('4/14')
  expect(inverse(s.tree)).toBe('  [ ] i')
})

test('pages by the window and scrolls to keep the cursor shown', () => {
  const s = board(list({ rows: 6 }))
  s.key('pagedown')
  let lines = linesOf(s.tree)
  expect(counter(s.tree)).toBe('6/14')
  expect([lines[1], lines.at(-1)]).toEqual(['  [H] b', '▾ in-progress  1'])
  s.key('pageup')
  lines = linesOf(s.tree)
  expect(counter(s.tree)).toBe('1/14')
  expect(lines[1]).toBe('▾ todo  4')
})

test('stops at either end of the list', () => {
  const s = board(list({ rows: 6 }))
  s.key('up')
  expect(counter(s.tree)).toBe('1/14')
  for (let i = 0; i < 5; i++) s.key('pagedown')
  expect(counter(s.tree)).toBe('14/14')
})

test('left on a row jumps to its heading', () => {
  const s = board(list({ rows: 6 }))
  s.key('down'), s.key('down')
  expect(inverse(s.tree)).toBe('  [M] a')
  s.key('left')
  expect(counter(s.tree)).toBe('1/14')
})

test('sets state only from a key, never while drawing', () => {
  const s = board(list({ rows: 6 }))
  for (let i = 0; i < 5; i++) s.render(list({ rows: 6 + i }))
  expect(s.setStateCalls).toBe(0)
  s.key('down')
  expect(s.setStateCalls).toBe(1)
})

test('clamps a stored cursor past the end of new props without setting state', () => {
  const s = board(list({ rows: 6 }))
  for (let i = 0; i < 10; i++) s.key('down')
  const calls = s.setStateCalls
  s.render(list({ rows: 6, groups: MIX_GROUPS.slice(0, 1) }))
  expect(counter(s.tree)).toBe('5/5')
  expect(s.setStateCalls).toBe(calls)
})

const downTo = (s: any, index: number) => {
  for (let i = 0; i < index; i++) s.key('down')
}

test('starts with done folded and unfolds it under right', () => {
  const s = board(list())
  downTo(s, 9)
  s.key('right')
  const lines = linesOf(s.tree)
  expect(counter(s.tree)).toBe('10/16')
  expect(lines.slice(11, 13)).toEqual(['  [H] f', '  [L] e'])
  s.key('left')
  expect(counter(s.tree)).toBe('10/14')
})

test('folds a heading under left and unfolds it under return', () => {
  const s = board(list())
  s.key('left')
  expect(counter(s.tree)).toBe('1/10')
  expect(linesOf(s.tree)).toContain('▸ todo  4')
  s.key('return')
  expect(counter(s.tree)).toBe('1/14')
})

test('right on an unfolded heading changes nothing', () => {
  const s = board(list())
  s.key('right')
  expect(s.posts).toEqual([])
  expect(s.setStateCalls).toBe(0)
  expect(counter(s.tree)).toBe('1/14')
})
