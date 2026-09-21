import { expect, test } from 'claude-code/testing'
import { renderTarget } from '../hooks/viz.ts'
import { cardName, listRows, resolveArgument, rowNamed, rowSlug, rowsOutside } from '../hooks/rows.ts'

test('resolves an empty argument to no selection', () => {
  expect(resolveArgument('', ['Active', 'Docs'])).toEqual({ kind: 'none' })
  expect(resolveArgument('   ', ['Active', 'Docs'])).toEqual({ kind: 'none' })
})

test('resolves exact view names before card names', () => {
  expect(resolveArgument('Docs', ['Active', 'Docs'])).toEqual({ kind: 'view', view: 'Docs' })
  expect(resolveArgument('By Parent', ['Active', 'By Parent'])).toEqual({ kind: 'view', view: 'By Parent' })
  expect(resolveArgument('Active', ['Active'])).toEqual({ kind: 'view', view: 'Active' })
})

test('resolves other arguments as case-sensitive card names', () => {
  expect(resolveArgument('mod-obw-issue-pane', ['Active', 'Docs'])).toEqual({ kind: 'card', card: 'mod-obw-issue-pane' })
  expect(resolveArgument('docs', ['Active', 'Docs'])).toEqual({ kind: 'card', card: 'docs' })
  expect(resolveArgument('Active', [])).toEqual({ kind: 'card', card: 'Active' })
})

test('lists paths by status and basename', () => {
  expect(listRows('p', [
    { path: 'pm/p/tasks/a.md', status: 'doing' },
    { path: 'pm/p/tasks/b.md', status: 'todo' },
    { path: 'pm/p/tasks/c.md', status: 'doing' },
  ])).toEqual([
    { path: 'pm/p/tasks/a.md', label: 'doing · a', status: 'doing' },
    { path: 'pm/p/tasks/c.md', label: 'doing · c', status: 'doing' },
    { path: 'pm/p/tasks/b.md', label: 'todo · b', status: 'todo' },
  ])
})

test('puts rows without a status last', () => {
  expect(listRows('p', [
    { path: 'pm/p/docs/d.md', status: null },
    { path: 'pm/p/tasks/a.md', status: 'todo' },
  ])).toEqual([
    { path: 'pm/p/tasks/a.md', label: 'todo · a', status: 'todo' },
    { path: 'pm/p/docs/d.md', label: 'd', status: null },
  ])
})

test('deduplicates and rejects unopenable paths', () => {
  expect(listRows('p', [
    { path: 'pm/p/tasks/a.md', status: 'todo' },
    { path: 'pm/p/tasks/a.md', status: 'todo' },
  ])).toEqual([{ path: 'pm/p/tasks/a.md', label: 'todo · a', status: 'todo' }])
  expect(listRows('p', [
    { path: 'pm/q/tasks/a.md', status: 'todo' },
    { path: 'pm/p/tasks/b\u0001.md', status: 'todo' },
  ])).toEqual([])
})

test('finds the row a name points at, wherever the view put it', () => {
  const rows = listRows('p', [{ path: 'pm/p/docs/d.md', status: null }, { path: 'pm/p/tasks/archive/c.md', status: 'done' }])
  expect(rowNamed(rows, 'p', 'd')).toBe('pm/p/docs/d.md')
  expect(rowNamed(rows, 'p', 'c')).toBe('pm/p/tasks/archive/c.md')
  expect(rowNamed(rows, 'p', 'nope')).toBe(null)
  expect(rowNamed([], 'p', 'd')).toBe(null)
})

test('keeps the task folder for a name two folders spell the same', () => {
  const rows = listRows('p', [{ path: 'pm/p/docs/a.md', status: null }, { path: 'pm/p/tasks/a.md', status: 'todo' }])
  expect(rowNamed(rows, 'p', 'a')).toBe('pm/p/tasks/a.md')
})

test('counts the rows no card path can be built from', () => {
  expect(rowsOutside('p', [
    { path: 'pm/p/tasks/a.md', status: 'todo' },
    { path: 'pm/q/tasks/a.md', status: 'todo' },
    { path: 'pm/p/tasks/b.txt', status: 'todo' },
    { path: 'pm/p/tasks/c\u0001.md', status: 'todo' },
  ])).toBe(3)
  expect(rowsOutside('p', [{ path: 'pm/p/docs/d.md', status: null }])).toBe(0)
})

test('counts one left-out row per path, as the list keeps one option per path', () => {
  expect(rowsOutside('p', [
    { path: 'pm/q/tasks/a.md', status: 'todo' },
    { path: 'pm/q/tasks/a.md', status: 'doing' },
    { path: 'pm/q/tasks/a.md', status: 'todo' },
  ])).toBe(1)
})

test('bounds row labels before rendering', () => {
  const [row] = listRows('p', [{ path: 'pm/p/tasks/a.md', status: 'x'.repeat(11000) }])
  expect(row.label).toHaveLength(10000)
})

test('keeps dashboard status groups in their arrival order', () => {
  expect(listRows('p', [
    { path: 'pm/p/tasks/a.md', status: 'todo' },
    { path: 'pm/p/tasks/b.md', status: 'doing' },
  ]).map(row => row.label)).toEqual(['todo · a', 'doing · b'])
})

test('keeps rows in their dashboard status group order', () => {
  expect(listRows('p', [
    { path: 'pm/p/tasks/a.md', status: 'todo' },
    { path: 'pm/p/tasks/b.md', status: 'doing' },
    { path: 'pm/p/tasks/c.md', status: 'todo' },
    { path: 'pm/p/tasks/d.md', status: 'blocked' },
  ]).map(row => row.label)).toEqual(['todo · a', 'todo · c', 'doing · b', 'blocked · d'])
})

test('does not own a status vocabulary', () => {
  expect(listRows('p', [
    { path: 'pm/p/tasks/a.md', status: 'zeta' },
    { path: 'pm/p/tasks/b.md', status: 'alpha' },
  ]).map(row => row.label)).toEqual(['zeta · a', 'alpha · b'])
})

test('keeps null-status dashboard rows in their arrival order', () => {
  expect(listRows('p', [
    { path: 'pm/p/docs/d.md', status: null },
    { path: 'pm/p/docs/e.md', status: null },
    { path: 'pm/p/docs/f.md', status: null },
  ]).map(row => row.label)).toEqual(['d', 'e', 'f'])
})

test('keeps null-status rows after their complete status group', () => {
  expect(listRows('p', [
    { path: 'pm/p/tasks/a.md', status: 'todo' },
    { path: 'pm/p/docs/d.md', status: null },
    { path: 'pm/p/tasks/b.md', status: 'todo' },
  ]).map(row => row.label)).toEqual(['todo · a', 'todo · b', 'd'])
})

test('uses each path below the project as a browser slug', () => {
  expect(rowSlug('cc-plugins', 'pm/cc-plugins/tasks/a.md')).toBe('tasks-a')
  expect(rowSlug('cc-plugins', 'pm/cc-plugins/docs/a.md')).toBe('docs-a')
  expect(renderTarget(rowSlug('p', 'pm/p/tasks/a.md')).file).toBe('/tmp/viz/obw/tasks-a.md')
  expect(renderTarget(rowSlug('p', 'pm/p/docs/a.md')).file).toBe('/tmp/viz/obw/docs-a.md')
  expect(rowSlug('cc-plugins', 'pm/cc-plugins/tasks/archive/adr-x.md')).toBe('tasks-archive-adr-x')
})

test('names a card from its vault path', () => {
  expect(cardName('pm/cc-plugins/tasks/archive/adr-x.md')).toBe('adr-x')
  expect(cardName('pm/cc-plugins/tasks/k.md')).toBe('k')
})
