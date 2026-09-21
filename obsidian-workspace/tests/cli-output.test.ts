import { expect, test } from 'claude-code/testing'
import * as out from '../hooks/cli-output.ts'
import { baseQueryArgv } from '../hooks/base-argv.ts'
import { VIEWS, VIEW_NAMES } from './fixtures/world.ts'

const { baseQueryOutput, readOutput, viewsOutput } = out
const run = (stdout: string, exitCode = 0, stderr = '') => ({ kind: 'exited' as const, exitCode, stdout, stderr })
const closed = 'The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.\n'
const NOT_RUN = 'The obsidian CLI did not run: it is not on PATH, or it did not answer within 10 s.'

test('removes legacy search output but keeps reads', () => {
  expect('searchOutput' in out).toBe(false)
  expect('readOutput' in out).toBe(true)
})

test('takes a row from its path and raw status and priority, not its labels', () =>
  expect(baseQueryOutput(run('[{"path":"pm/p/tasks/a.md","Title":"A","status":"todo","priority":"high","due":null,"Days Until Due":"","tags":["x"]}]'))).toEqual({
    kind: 'rows',
    rows: [{ path: 'pm/p/tasks/a.md', status: 'todo', priority: 'high' }],
  }))

test('reads a row with no status key as no status', () =>
  expect(baseQueryOutput(run('[{"path":"pm/p/tasks/archive/x.md","Title":"X","completed":"2026-09-01","tags":[]}]'))).toEqual({
    kind: 'rows',
    rows: [{ path: 'pm/p/tasks/archive/x.md', status: null, priority: null }],
  }))

test('reads a null status as no status', () =>
  expect(baseQueryOutput(run('[{"path":"pm/p/docs/d.md","Title":"D","type":"doc","status":null,"updated":"2026-09-19"}]'))).toEqual({
    kind: 'rows',
    rows: [{ path: 'pm/p/docs/d.md', status: null, priority: null }],
  }))

test('reads a non-string priority as no priority', () =>
  expect(baseQueryOutput(run('[{"path":"pm/p/tasks/b.md","status":"todo","priority":1}]'))).toEqual({
    kind: 'rows',
    rows: [{ path: 'pm/p/tasks/b.md', status: 'todo', priority: null }],
  }))

test('reads raw priority, not a Priority label', () => {
  const result = baseQueryOutput(run('[{"path":"pm/p/tasks/c.md","Priority":"high","priority":"low"}]'))
  expect(result.kind).toBe('rows')
  if (result.kind === 'rows') expect(result.rows[0].priority).toBe('low')
})

test('passes a missing All Tasks view through', () =>
  expect(baseQueryOutput(run('Error: View not found: All Tasks\nAvailable views: Active'))).toEqual({
    kind: 'error',
    message: 'Error: View not found: All Tasks\nAvailable views: Active',
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

const yamlViews = (...names: string[]) => `views:\n${names.map((name) => `  - type: table\n    name: "${name}"\n`).join('')}`
// The names a listing offers the switcher: a listing of no known shape offers none.
const namesOf = (listing: ReturnType<typeof viewsOutput>) => (listing.kind === 'views' ? listing.views : [])

test('reads the dashboard view names in order', () => {
  expect(namesOf(viewsOutput(run(VIEWS)))).toEqual(VIEW_NAMES)
  expect(viewsOutput(run(VIEWS))).toEqual({ kind: 'views', views: VIEW_NAMES })
})

test('reads a name-first unquoted list', () =>
  expect(viewsOutput(run('views:\n  - name: Active\n    type: table\n  - name: Docs\n    type: table\n'))).toEqual({
    kind: 'views',
    views: ['Active', 'Docs'],
  }))

test('reads column-0 view items', () => expect(viewsOutput(run('views:\n- type: table\n  name: Active\n'))).toEqual({ kind: 'views', views: ['Active'] }))

test('drops an unquoted hash comment from a view name', () =>
  expect(namesOf(viewsOutput(run('views:\n  - type: table\n    name: Board / Active # mine\n')))).toEqual(['Board / Active']))

test('keeps a hash inside a quoted view name', () =>
  expect(namesOf(viewsOutput(run('views:\n  - type: table\n    name: "A # B"\n')))).toEqual(['A # B']))

test('ignores a properties displayName named name', () =>
  expect(namesOf(viewsOutput(run('properties:\n  name:\n    displayName: Name\n  note.name:\n    displayName: N\nviews:\n  - type: table\n    name: "Docs"\n')))).toEqual(['Docs']))

test('ignores a nested name under groupBy', () =>
  expect(namesOf(viewsOutput(run('views:\n  - type: table\n    groupBy:\n      name: inner\n    name: "Active"\n')))).toEqual(['Active']))

test('drops a view name that would be drawn stripped', () =>
  expect(namesOf(viewsOutput(run(yamlViews('A\u001bB', 'Docs'))))).toEqual(['Docs']))

test('drops an overlong view name', () =>
  expect(namesOf(viewsOutput(run(yamlViews('v'.repeat(11000), 'Docs'))))).toEqual(['Docs']))

test('offers only view names the query builder accepts', () => {
  const offered = [...namesOf(viewsOutput(run(VIEWS))), ...namesOf(viewsOutput(run(yamlViews('A\u001bB', 'Docs'))))]
  expect(offered).toHaveLength(8)
  for (const name of offered) expect(baseQueryArgv({ vault: 'obsidian', project: 'cc-plugins' }, name)).toHaveProperty('argv')
})

test('reads a views list with no items as empty', () => expect(viewsOutput(run('filters:\n  and: []\nviews:\n'))).toEqual({ kind: 'empty' }))

test('reads an empty flow views list as empty', () => expect(viewsOutput(run('views: []\n'))).toEqual({ kind: 'empty' }))

test('reads a views key with only a comment as empty', () => expect(viewsOutput(run("views:  # none yet\nformulas:\n  x: '1'\n"))).toEqual({ kind: 'empty' }))

test('offers no view when the CLI did not run', () => {
  const listing = viewsOutput({ kind: 'rejected' })
  expect(namesOf(listing)).toEqual([])
  expect(listing).toEqual({ kind: 'error', message: NOT_RUN })
})

test('offers no view from a failed listing', () => {
  const listing = viewsOutput(run(VIEWS, 1, closed))
  expect(namesOf(listing)).toEqual([])
  expect(listing).toEqual({ kind: 'error', message: closed.trim() })
  const silent = viewsOutput(run('views:\n  - name: Active\n', 1))
  expect(namesOf(silent)).toEqual([])
  expect(silent).toEqual({ kind: 'error', message: 'views:\n  - name: Active' })
})

test('offers no view when the base file is missing', () => {
  const listing = viewsOutput(run('Error: File "pm/p/dashboard.base" not found.\n'))
  expect(namesOf(listing)).toEqual([])
  expect(listing).toEqual({ kind: 'error', message: 'Error: File "pm/p/dashboard.base" not found.' })
})

test('offers no view from a vault-not-found read', () =>
  expect(viewsOutput(run('Vault not found.'))).toEqual({ kind: 'error', message: 'Vault not found.' }))

test('does not read a base without views as empty', () =>
  expect(viewsOutput(run('filters:\n  and: []\n'))).toEqual({ kind: 'error', message: 'filters:\n  and: []' }))

test('does not read a flow views value as a list', () =>
  expect(viewsOutput(run('views: [{type: table, name: Active}]'))).toEqual({
    kind: 'error',
    message: 'views: [{type: table, name: Active}]',
  }))

test('reads a listing whose every name could not be drawn as an error, not as no views', () => {
  const stdout = 'views:\n  - type: table\n    name: "A\u001bB"\n'
  const listing = viewsOutput(run(stdout))
  expect(namesOf(listing)).toEqual([])
  expect(listing).toEqual({ kind: 'error', message: stdout.trim() })
})

test('reads an item with no name as an error, not as no views', () =>
  expect(viewsOutput(run('views:\n  - type: table\n'))).toEqual({ kind: 'error', message: 'views:\n  - type: table' }))

test('does not read a name\\ttype listing as views', () =>
  expect(viewsOutput(run('Active\ttable\nDocs\ttable\n'))).toEqual({ kind: 'error', message: 'Active\ttable\nDocs\ttable' }))

test('reports empty dashboard output', () =>
  expect(viewsOutput(run(''))).toEqual({ kind: 'error', message: 'obsidian exited 0 with no output.' }))

test('does not read an indented views key as the dashboard list', () =>
  expect(viewsOutput(run('    views:\n  - name: A\n')).kind).toBe('error'))

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
