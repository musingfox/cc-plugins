import { expect, test } from 'claude-code/testing'
import { countRows } from '../hooks/counts.ts'
import { listGroups } from '../hooks/list.ts'
import { MIX, P } from './fixtures/rows.ts'

test('groups rows by status in schema order, each sorted by priority', () => {
  const { groups } = listGroups('cc-plugins', MIX)
  expect(groups.map((group) => group.status)).toEqual(['todo', 'in-progress', 'blocked', 'done', 'waiting', null])
  expect(groups.map((group) => group.count)).toEqual([4, 1, 1, 2, 1, 1])
  expect(groups[0].rows.map((row) => row.path)).toEqual([P('b'), P('a'), P('i'), P('j')])
  expect(groups[0].rows.map((row) => row.badge)).toEqual(['H', 'M', ' ', ' '])
  expect(groups[3].rows.map((row) => row.path)).toEqual([P('f'), P('e')])
})

test('group counts match countRows over the same rows', () => {
  const counted = countRows('cc-plugins', MIX)
  const { groups } = listGroups('cc-plugins', MIX)
  for (const group of groups) {
    expect(group.count).toBe(
      group.status === null ? counted.status.missing : counted.status.values.find((entry) => entry.value === group.status)!.count,
    )
  }
  expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(counted.total)
  expect(counted.total).toBe(10)
})

test('treats empty, null and absent status as one missing group', () => {
  const { groups } = listGroups('cc-plugins', [{ path: P('a'), status: '' }, { path: P('b'), status: null }, { path: P('c') }])
  expect(groups.map(({ status, count }) => ({ status, count }))).toEqual([{ status: null, count: 3 }])
})

test('an empty listing or one outside the project has no groups', () => {
  expect(listGroups('cc-plugins', [])).toEqual({ groups: [], hidden: 0 })
  expect(listGroups('cc-plugins', [{ path: 'pm/other/tasks/x.md', status: 'todo' }])).toEqual({ groups: [], hidden: 0 })
})

test('an empty title falls back to the file name', () => {
  const { groups } = listGroups('cc-plugins', [{ path: P('a'), title: '' }, { path: P('b'), title: '中文' }])
  expect(groups[0].rows.map((row) => row.title)).toEqual(['a', '中文'])
})

test('shows at most 100 rows and counts the rest as hidden', () => {
  const rows = Array.from({ length: 150 }, (_, n) => ({ path: P(`r${n}`), status: 'todo' }))
  const { groups, hidden } = listGroups('cc-plugins', rows)
  expect(groups[0].rows.length).toBe(100)
  expect(hidden).toBe(50)
  expect(groups[0].count).toBe(150)
})

test('bounds and caps the drawn fields', () => {
  const { groups } = listGroups('cc-plugins', [{ path: P('a'), status: 'a\rb', title: 'x'.repeat(11000), tags: 'c\rd' }])
  expect(groups[0].status).toBe('ab')
  expect(groups[0].rows[0].title.length).toBe(80)
  expect(groups[0].rows[0].tags).toBe('cd')
})

test('the worst-case list stays within 100,000 serialized characters', () => {
  const quotes = '"'.repeat(11000)
  const rows = Array.from({ length: 100 }, (_, n) => {
    const path = P(`${n}`.padStart(3, '0').padEnd(200 - P('').length, '"'))
    return { path, status: `${n}`.padEnd(11000, '"'), priority: 'high', title: quotes, due: quotes, tags: quotes }
  })
  expect(rows.every((row) => row.path.length === 200)).toBe(true)
  const result = listGroups('cc-plugins', rows)
  expect(result.groups.length).toBe(100)
  expect(result.hidden).toBe(0)
  expect(JSON.stringify(result).length <= 100000).toBe(true)
})

test('a row with a path longer than 200 characters is hidden', () => {
  const path = P('a'.repeat(201 - P('').length))
  expect(path.length).toBe(201)
  expect(listGroups('cc-plugins', [{ path, status: 'todo' }])).toEqual({ groups: [], hidden: 1 })
})
