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
