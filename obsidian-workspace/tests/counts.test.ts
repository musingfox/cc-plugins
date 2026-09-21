import { expect, test } from 'claude-code/testing'
import { baseQueryArgv } from '../hooks/base-argv.ts'
import { baseQueryOutput } from '../hooks/cli-output.ts'
import { COUNT_VIEW, countRows, missingViewHint, missingViewText } from '../hooks/counts.ts'
import { listRows, rowsOutside } from '../hooks/rows.ts'

const run = (stdout: string) => ({ kind: 'exited' as const, exitCode: 0, stdout, stderr: '' })

function rowsOf(stdout: string) {
  const result = baseQueryOutput(run(stdout))
  return result.kind === 'rows' ? result.rows : []
}

test('keeps the first card when a path appears twice', () =>
  expect(countRows('p', [
    { path: 'pm/p/tasks/a.md', status: 'todo', priority: 'high' },
    { path: 'pm/p/tasks/a.md', status: 'done', priority: 'low' },
  ])).toEqual({
    total: 1,
    outside: 0,
    status: { values: [{ value: 'todo', count: 1 }], missing: 0 },
    priority: { values: [{ value: 'high', count: 1 }], missing: 0 },
  }))

test('counts one left-out path and one in-project card', () =>
  expect(countRows('p', [
    { path: 'pm/q/tasks/x.md', status: 'todo' },
    { path: 'pm/q/tasks/x.md', status: 'todo' },
    { path: 'pm/p/tasks/a.md', status: 'todo' },
  ])).toEqual({
    total: 1,
    outside: 1,
    status: { values: [{ value: 'todo', count: 1 }], missing: 0 },
    priority: { values: [], missing: 1 },
  }))

test('counts the same cards the pane would list', () => {
  const rows = [
    { path: 'pm/p/tasks/a.md', status: 'todo', priority: 'high' },
    { path: 'pm/p/tasks/a.md', status: 'done', priority: 'low' },
    { path: 'pm/q/tasks/x.md', status: 'todo' },
    { path: 'pm/q/tasks/x.md', status: 'todo' },
    { path: 'pm/p/docs/d.md', status: null },
    { path: 'pm/p/tasks/b.txt', status: 'todo' },
  ]
  const counted = countRows('p', rows)
  expect(counted.total).toBe(listRows('p', rows).length)
  expect(counted.outside).toBe(rowsOutside('p', rows))
})

test('counts an empty listing as zeros', () =>
  expect(countRows('p', [])).toEqual({
    total: 0,
    outside: 0,
    status: { values: [], missing: 0 },
    priority: { values: [], missing: 0 },
  }))

test('queries the All Tasks view', () => {
  expect(COUNT_VIEW).toBe('All Tasks')
  expect(baseQueryArgv({ vault: 'obsidian', project: 'cc-plugins' }, COUNT_VIEW)).toHaveProperty('argv')
})

test('tallies each status and counts cards with none', () =>
  expect(countRows('p', [
    { path: 'pm/p/tasks/a.md', status: 'todo' },
    { path: 'pm/p/tasks/b.md', status: 'done' },
    { path: 'pm/p/tasks/c.md', status: 'todo' },
    { path: 'pm/p/tasks/d.md', status: null },
    { path: 'pm/p/tasks/e.md' },
    { path: 'pm/p/tasks/f.md', status: '' },
  ])).toEqual({
    total: 6,
    outside: 0,
    status: { values: [{ value: 'todo', count: 2 }, { value: 'done', count: 1 }], missing: 3 },
    priority: { values: [], missing: 6 },
  }))

test('keeps a status the schema does not name', () =>
  expect(countRows('p', [{ path: 'pm/p/tasks/a.md', status: 'doing' }]).status.values).toEqual([{ value: 'doing', count: 1 }]))

test('treats (none) as a status and null as missing', () =>
  expect(countRows('p', [
    { path: 'pm/p/tasks/a.md', status: '(none)' },
    { path: 'pm/p/tasks/b.md', status: null },
  ]).status).toEqual({ values: [{ value: '(none)', count: 1 }], missing: 1 }))

test('tallies __proto__ as a status string', () =>
  expect(countRows('p', [{ path: 'pm/p/tasks/a.md', status: '__proto__' }]).status.values).toEqual([{ value: '__proto__', count: 1 }]))

test('tallies each priority and counts cards with none', () =>
  expect(countRows('p', [
    { path: 'pm/p/tasks/a.md', priority: 'high' },
    { path: 'pm/p/tasks/b.md', priority: 'low' },
    { path: 'pm/p/tasks/c.md', priority: 'high' },
    { path: 'pm/p/tasks/d.md', priority: null },
  ]).priority).toEqual({ values: [{ value: 'high', count: 2 }, { value: 'low', count: 1 }], missing: 1 }))

test('counts the same cards when column labels change', () => {
  const a = '[{"path":"pm/p/tasks/a.md","Title":"A","status":"todo","priority":"high"},{"path":"pm/p/tasks/b.md","Title":"B","status":"done"}]'
  const b = '[{"path":"pm/p/tasks/a.md","Name":"A","status":"todo","priority":"high"},{"path":"pm/p/tasks/b.md","Name":"B","status":"done"}]'
  const countedA = countRows('p', rowsOf(a))
  const countedB = countRows('p', rowsOf(b))
  expect(countedA).toEqual(countedB)
  expect(countedA.status.values).toEqual([{ value: 'todo', count: 1 }, { value: 'done', count: 1 }])
  expect(countedA.priority.values).toEqual([{ value: 'high', count: 1 }])
  expect(countedA.priority.missing).toBe(1)
})

test('keeps a priority the schema does not name', () =>
  expect(countRows('p', [{ path: 'pm/p/tasks/a.md', priority: 'urgent' }]).priority.values).toEqual([{ value: 'urgent', count: 1 }]))

test('hints when All Tasks is missing', () =>
  expect(missingViewHint('p', 'Error: View not found: All Tasks\nAvailable views: Active, Blocked')).toBe(
    'pm/p/dashboard.base has no All Tasks view. Run /obw:pm refresh dashboard to regenerate it from the plugin template; hand edits to that file are overwritten.',
  ))

test('does not hint for a different missing view', () =>
  expect(missingViewHint('p', 'Error: View not found: Nope\nAvailable views: Active')).toBe(null))

test('does not hint for a missing base file', () =>
  expect(missingViewHint('p', 'Error: Base file not found: pm/p/dashboard.base')).toBe(null))

test('does not hint for a longer view name', () =>
  expect(missingViewHint('p', 'Error: View not found: All Tasks Extra')).toBe(null))

test('names the counted view in the hint', () =>
  expect(missingViewHint('p', `Error: View not found: ${COUNT_VIEW}`)).toContain(`has no ${COUNT_VIEW} view`))

test('exports the refresh hint text', () =>
  expect(missingViewText('p')).toBe(
    'pm/p/dashboard.base has no All Tasks view. Run /obw:pm refresh dashboard to regenerate it from the plugin template; hand edits to that file are overwritten.',
  ))
