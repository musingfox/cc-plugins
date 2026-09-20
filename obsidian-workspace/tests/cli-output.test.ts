import { expect, test } from 'claude-code/testing'
import * as out from '../hooks/cli-output.ts'
import { baseQueryArgv } from '../hooks/base-argv.ts'

const { baseQueryOutput, readOutput, viewsOutput } = out
const run = (stdout: string, exitCode = 0, stderr = '') => ({ kind: 'exited' as const, exitCode, stdout, stderr })
const closed = 'The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.\n'
const NOT_RUN = 'The obsidian CLI did not run: it is not on PATH, or it did not answer within 10 s.'

test('removes legacy search output but keeps reads', () => {
  expect('searchOutput' in out).toBe(false)
  expect('readOutput' in out).toBe(true)
})

test('takes a row from its path and raw status, not its labels', () =>
  expect(baseQueryOutput(run('[{"path":"pm/p/tasks/a.md","Title":"A","status":"todo","priority":"high","due":null,"Days Until Due":"","tags":["x"]}]'))).toEqual({
    kind: 'rows',
    rows: [{ path: 'pm/p/tasks/a.md', status: 'todo' }],
  }))

test('reads a row with no status key as no status', () =>
  expect(baseQueryOutput(run('[{"path":"pm/p/tasks/archive/x.md","Title":"X","completed":"2026-09-01","tags":[]}]'))).toEqual({
    kind: 'rows',
    rows: [{ path: 'pm/p/tasks/archive/x.md', status: null }],
  }))

test('reads a null status as no status', () =>
  expect(baseQueryOutput(run('[{"path":"pm/p/docs/d.md","Title":"D","type":"doc","status":null,"updated":"2026-09-19"}]'))).toEqual({
    kind: 'rows',
    rows: [{ path: 'pm/p/docs/d.md', status: null }],
  }))

test('reads an empty dashboard answer as empty', () => expect(baseQueryOutput(run('[]'))).toEqual({ kind: 'empty' }))

test('never drops a malformed row silently', () =>
  expect(baseQueryOutput(run('[{"path":"pm/p/tasks/a.md"},{"path":3}]'))).toEqual({
    kind: 'error',
    message: '[{"path":"pm/p/tasks/a.md"},{"path":3}]',
  }))

test('passes a missing base file through', () =>
  expect(baseQueryOutput(run('Error: Base file not found: pm/p/dashboard.base'))).toEqual({
    kind: 'error',
    message: 'Error: Base file not found: pm/p/dashboard.base',
  }))

test('passes an unknown view and its available views through', () =>
  expect(baseQueryOutput(run('Error: View not found: Nope\nAvailable views: Active, Blocked'))).toEqual({
    kind: 'error',
    message: 'Error: View not found: Nope\nAvailable views: Active, Blocked',
  }))

test('rejects successful shaped output on a failed query', () => {
  const result = baseQueryOutput(run('[]', 1, closed))
  expect(result.kind).toBe('error')
  expect(result).toEqual({ kind: 'error', message: closed.trim() })
})

test('uses stderr for a failed query that printed nothing', () =>
  expect(baseQueryOutput(run('', 1, closed))).toEqual({ kind: 'error', message: closed.trim() }))

test('reports empty query output', () =>
  expect(baseQueryOutput(run(''))).toEqual({ kind: 'error', message: 'obsidian exited 0 with no output.' }))

test('reports a query that did not run', () =>
  expect(baseQueryOutput({ kind: 'rejected' })).toEqual({ kind: 'error', message: NOT_RUN }))

const VIEWS = 'Active\ttable\nBlocked\ttable\nBy Parent\ttable\nRecently Completed\ttable\nBy Tag\ttable\nDocs\ttable\n'
const TABBED = 'A\tB\ttable\nDocs\ttable\n'
// The names a listing offers the switcher: a listing of no known shape offers none.
const namesOf = (listing: ReturnType<typeof viewsOutput>) => (listing.kind === 'views' ? listing.views : [])

test('reads the dashboard view names in order', () => {
  expect(namesOf(viewsOutput(run(VIEWS)))).toEqual(['Active', 'Blocked', 'By Parent', 'Recently Completed', 'By Tag', 'Docs'])
  expect(viewsOutput(run(VIEWS))).toEqual({ kind: 'views', views: ['Active', 'Blocked', 'By Parent', 'Recently Completed', 'By Tag', 'Docs'] })
})

test('does not whitelist a view type', () => expect(namesOf(viewsOutput(run('Cards\tcards\n')))).toEqual(['Cards']))

test('drops a view name that would be drawn stripped', () =>
  expect(namesOf(viewsOutput(run('A\u001bB\ttable\nDocs\ttable\n')))).toEqual(['Docs']))

test('drops a view name that still holds a tab', () => expect(namesOf(viewsOutput(run(TABBED)))).toEqual(['Docs']))

test('offers no view when the base file is missing', () => {
  const listing = viewsOutput(run('Error: Base file not found: pm/p/dashboard.base'))
  expect(namesOf(listing)).toEqual([])
  expect(listing).toEqual({ kind: 'error', message: 'Error: Base file not found: pm/p/dashboard.base' })
})

test('offers no view when the CLI did not run', () => {
  const listing = viewsOutput({ kind: 'rejected' })
  expect(namesOf(listing)).toEqual([])
  expect(listing).toEqual({ kind: 'error', message: NOT_RUN })
})

test('offers no view from a failed listing', () => {
  const listing = viewsOutput(run('Active\ttable\n', 1, closed))
  expect(namesOf(listing)).toEqual([])
  expect(listing).toEqual({ kind: 'error', message: closed.trim() })
  const silent = viewsOutput(run('Active\ttable\n', 1))
  expect(namesOf(silent)).toEqual([])
  expect(silent).toEqual({ kind: 'error', message: 'Active\ttable' })
})

test('reads a dashboard that lists no view as empty', () => expect(viewsOutput(run(''))).toEqual({ kind: 'empty' }))

test('reads a listing carrying a line that is not a view as an error', () => {
  const listing = viewsOutput(run('Note: dashboard updated\nActive\ttable\n'))
  expect(namesOf(listing)).toEqual([])
  expect(listing).toEqual({ kind: 'error', message: 'Note: dashboard updated\nActive\ttable' })
})

test('offers only view names the query builder accepts', () => {
  const offered = [...namesOf(viewsOutput(run(VIEWS))), ...namesOf(viewsOutput(run(TABBED)))]
  expect(offered).toHaveLength(7)
  for (const name of offered) expect(baseQueryArgv('obsidian', 'cc-plugins', name)).toHaveProperty('argv')
})

const CARD = '---\ntitle: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\ndue:\ntags:\n  - claude-mods\ncreated: 2026-09-18\n---\n# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n'
test('recognizes closed card frontmatter', () => expect(readOutput(run(CARD))).toEqual({ kind: 'card', frontmatter: 'title: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\ndue:\ntags:\n  - claude-mods\ncreated: 2026-09-18', body: '# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n' }))
test('recognizes empty frontmatter', () => expect(readOutput(run('---\n---\nbody'))).toEqual({ kind: 'card', frontmatter: '', body: 'body' }))
test('reports missing card output', () => expect(readOutput(run('Error: File "pm/p/tasks/x.md" not found.\n'))).toEqual({ kind: 'error', message: 'Error: File "pm/p/tasks/x.md" not found.' }))
test('reports vault read output', () => expect(readOutput(run('Vault not found.'))).toEqual({ kind: 'error', message: 'Vault not found.' }))
test('rejects unclosed frontmatter', () => expect(readOutput(run('---\ntitle: x\n'))).toEqual({ kind: 'error', message: '---\ntitle: x' }))
test('rejects a body without frontmatter', () => expect(readOutput(run('# no frontmatter\n'))).toEqual({ kind: 'error', message: '# no frontmatter' }))
test('rejects CRLF frontmatter', () => expect(readOutput(run('---\r\ntitle: x\r\n---\r\n')).kind).toBe('error'))
test('uses stderr and rejection for failed reads', () => { expect(readOutput(run('', 1, closed))).toEqual({ kind: 'error', message: closed.trim() }); expect(readOutput({ kind: 'rejected' })).toEqual({ kind: 'error', message: NOT_RUN }) })
test('closes frontmatter only at a line that is exactly ---', () => expect(readOutput(run('---\ntitle: x---\n---\nbody'))).toEqual({ kind: 'card', frontmatter: 'title: x---', body: 'body' }))
test('does not close frontmatter at a longer dash line', () => expect(readOutput(run('---\na: 1\n----\n---\nbody'))).toEqual({ kind: 'card', frontmatter: 'a: 1\n----', body: 'body' }))
test('closes frontmatter at a final --- with no newline', () => expect(readOutput(run('---\ntitle: x\n---'))).toEqual({ kind: 'card', frontmatter: 'title: x', body: '' }))
