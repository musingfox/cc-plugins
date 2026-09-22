import { expect, test } from 'claude-code/testing'
import Board from '../hooks/board.ts'
import { RED } from '../hooks/style.ts'
import { fakeSurface, linesOf, textsOf } from './fixtures/surface.ts'
import { P } from './fixtures/rows.ts'
const row = (name: string, badge: string, fields: any = {}) => ({ path: P(name), badge, title: name, due: '', tags: '', ...fields })

// MIX (fixtures/rows.ts) as the pane hands it over: status groups in schema order, rows by priority.
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

test('folds a status named — apart from the missing-status group', () => {
  const s = board(list({ groups: [{ status: '—', count: 1, rows: [row('a', ' ')] }, { status: null, count: 1, rows: [row('b', ' ')] }] }))
  s.key('left')
  expect(linesOf(s.tree).slice(1)).toEqual(['▸ —  1', '▾ —  1', '  [ ] b'])
})

test('folds two headings that read the same apart', () => {
  const s = board(list({ groups: [{ status: 'x…', count: 1, rows: [row('a', ' ')] }, { status: 'x…', count: 1, rows: [row('b', ' ')] }] }))
  s.key('left')
  expect(linesOf(s.tree).slice(1)).toEqual(['▸ x…  1', '▾ x…  1', '  [ ] b'])
})

test('right on an unfolded heading changes nothing', () => {
  const s = board(list())
  s.key('right')
  expect(s.posts).toEqual([])
  expect(s.setStateCalls).toBe(0)
  expect(counter(s.tree)).toBe('1/14')
})

test('return on a row asks to open its card', () => {
  const s = board(list())
  s.key('down')
  const calls = s.setStateCalls
  s.key('return')
  expect(s.posts).toEqual([{ open: 'pm/cc-plugins/tasks/b.md' }])
  expect(s.setStateCalls).toBe(calls)
})

test('right on a row asks to open its card', () => {
  const s = board(list())
  s.key('down')
  s.key('right')
  expect(s.posts).toEqual([{ open: 'pm/cc-plugins/tasks/b.md' }])
})

test('return on a heading opens nothing', () => {
  const s = board(list())
  s.key('return')
  expect(s.posts).toEqual([])
})

const BODY = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join('\n')
const shown = (fields: any = {}) => ({ kind: 'shown', path: P('b'), title: 'T', status: 'todo', priority: 'high', ac: 'AC 0/1', clip: null, body: BODY, ...fields })
const cardProps = (card: any) => ({ rows: 6, columns: 40, groups: [], hidden: 0, card })

test('draws a shown card in place of the list', () => {
  expect(linesOf(board(cardProps(shown())).tree)).toEqual(['↑↓ scroll  ← list  1/20', 'T', 'todo · high · AC 0/1', 'l1', 'l2', 'l3'])
})

test('fits each card header line to the width, keeping the body window', () => {
  const lines = linesOf(board(cardProps(shown({ title: 'x'.repeat(100), status: 's'.repeat(100), clip: 'c'.repeat(100) }))).tree)
  expect(lines.slice(1, 4)).toEqual(['x'.repeat(39) + '…', 's'.repeat(39) + '…', 'c'.repeat(39) + '…'])
  expect(lines.slice(4)).toEqual(['l1', 'l2'])
})

test('wraps a wide body line at the width', () => {
  expect(linesOf(board(cardProps(shown({ body: '中'.repeat(25) }))).tree).slice(3)).toEqual(['中'.repeat(20), '中'.repeat(5)])
})

test('draws a card being read', () => {
  expect(linesOf(board(cardProps({ kind: 'loading', name: 'b' })).tree)).toContain('Reading b…')
})

test('draws a card read failure in red', () => {
  const message = 'Error: File "x" not found.'
  const text = textsOf(board(cardProps({ kind: 'error', message })).tree).find((node) => node.props.children.join('') === message)
  expect(text.props.color).toBe(RED)
})

test('expands a tab in the card body to spaces before wrapping', () => {
  expect(linesOf(board(cardProps(shown({ body: '\t' + 'x'.repeat(38) }))).tree).slice(3)).toEqual(['    ' + 'x'.repeat(36), 'xx'])
})

test('counts no lines for an empty body', () => {
  expect(counter(board(cardProps(shown({ body: '' }))).tree)).toBe('0/0')
})

test('keeps the list cursor while a card is shown', () => {
  const s = board(list())
  downTo(s, 3)
  s.render(cardProps(shown()))
  s.render(list())
  expect(counter(s.tree)).toBe('4/14')
})

const bodyOf = (tree: any) => linesOf(tree).slice(3)

test('scrolls the card body by a line and by a page', () => {
  const s = board(cardProps(shown()))
  s.key('down')
  expect(bodyOf(s.tree)).toEqual(['l2', 'l3', 'l4'])
  expect(counter(s.tree)).toBe('2/20')
  s.key('pagedown')
  expect(bodyOf(s.tree)).toEqual(['l5', 'l6', 'l7'])
  for (let i = 0; i < 10; i++) s.key('pagedown')
  expect(bodyOf(s.tree)).toEqual(['l18', 'l19', 'l20'])
  expect(counter(s.tree)).toBe('18/20')
})

test('stays at the top of a fresh card', () => {
  const s = board(cardProps(shown()))
  s.key('up')
  expect(counter(s.tree)).toBe('1/20')
})

test('starts another card from the top without setting state', () => {
  const s = board(cardProps(shown()))
  downTo(s, 4)
  expect(counter(s.tree)).toBe('5/20')
  const calls = s.setStateCalls
  s.render(cardProps(shown({ path: P('a') })))
  expect(counter(s.tree)).toBe('1/20')
  expect(s.setStateCalls).toBe(calls)
})

test('left on a shown card asks to go back to the list', () => {
  const s = board(cardProps(shown()))
  s.key('left')
  expect(s.posts).toEqual([{ back: true }])
})

test('left on a card read failure asks to go back to the list', () => {
  const s = board(cardProps({ kind: 'error', message: 'Error: File "x" not found.' }))
  s.key('left')
  expect(s.posts).toEqual([{ back: true }])
})

test('left on a list row moves the cursor and posts nothing', () => {
  const s = board(list())
  s.key('down')
  s.key('left')
  expect(s.posts).toEqual([])
  expect(counter(s.tree)).toBe('1/14')
})
