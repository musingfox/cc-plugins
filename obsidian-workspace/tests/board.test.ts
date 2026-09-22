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
