import { describe, expect, test } from 'claude-code/testing'
import { PANE, headerIn, issue, nodesOf, stringsIn } from './fixtures/pane.ts'
import { CARD, QUERY_ARGV, SESSION, VIEWS, world } from './fixtures/world.ts'
const rows = (paths: string[]) => JSON.stringify(paths.map((path, i) => ({ path, status: i ? 'doing' : 'todo' })))
const text = async ($: any) => stringsIn(await $.ui.render(PANE))
const runsOf = (w: any, verb: string) => w.runs.filter((run: any) => run.argv[2] === verb)

describe('dashboard pane', () => {
  test('registers the dashboard command', async ($, on) => { const w = world(on); await $.session.start(SESSION); expect(w.registered[0]).toMatchObject({ name: 'issue', argumentHint: '[view|card]' }) })
  test('keeps working when registration is refused', async ($, on) => { world(on, { register: { deny: 'taken' } }); expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' }) })
  test('lists Active rows in CLI order', async ($, on) => { const w = world(on, { query: rows(['pm/cc-plugins/tasks/a.md', 'pm/cc-plugins/tasks/b.md']) }); await issue($, ''); expect(w.runs.map((x: any) => x.argv)).toEqual([['obsidian', 'vault=obsidian', 'base:views', 'path=pm/cc-plugins/dashboard.base'], QUERY_ARGV]); const selects = nodesOf(await $.ui.render(PANE), 'Select'); expect(selects[1].props.options).toEqual([{ value: 'pm/cc-plugins/tasks/a.md', label: 'todo · a' }, { value: 'pm/cc-plugins/tasks/b.md', label: 'doing · b' }]) })
  test('does not run while drawing', async ($, on) => { const w = world(on); await issue($, ''); await $.ui.render(PANE); await $.ui.render(PANE); expect(w.runs).toHaveLength(2) })
  test('shows an empty view notice', async ($, on) => { world(on, { query: '[]' }); await issue($, ''); const tree = await $.ui.render(PANE); expect(text($)).resolves.toContain('No cards in the Active view of pm/cc-plugins.'); expect(nodesOf(tree, 'Select')).toHaveLength(1) })
  test('switches to an argument view', async ($, on) => { const w = world(on); await issue($, 'Docs'); expect(runsOf(w, 'base:query')[0].argv).toContain('view=Docs'); expect(nodesOf(await $.ui.render(PANE), 'Select')[0].props.value).toBe('Docs') })
  test('treats an argument as a card without views', async ($, on) => { const w = world(on, { views: { deny: 'no' } }); await issue($, 'Active'); expect(w.runs[1].argv).toEqual(['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/Active.md']) })
  test('refuses unsafe card names before config', async ($, on) => { const w = world(on); await issue($, 'a/b'); expect(w.runs).toEqual([]); expect(w.existsCalls).toEqual([]); expect(await text($)).toContain('"a/b" is not a card name.') })
  test('keeps config errors local', async ($, on) => { const w = world(on, { files: {} }); await issue($, ''); expect(w.runs).toEqual([]); expect(await text($)).toContain('No .obsidian.yaml in /work or any directory above it.') })
  test('shows query errors and the pm hint', async ($, on) => { world(on, { query: 'Vault not found.\n' }); await issue($, ''); const drawn = await text($); expect(drawn).toContain('Vault not found.'); expect(drawn).toContain('If pm/cc-plugins/dashboard.base is missing, run /obw:pm to create it.') })
  test('does not show the hint for healthy rows', async ($, on) => { world(on); await issue($, ''); expect((await text($)).some((x: string) => x.includes('/obw:pm'))).toBe(false) })
  test('opens a typed card by task path', async ($, on) => { const w = world(on, { query: rows(['pm/cc-plugins/tasks/mod-obw-issue-pane.md']), read: CARD }); await issue($, 'mod-obw-issue-pane'); expect(w.runs[2].argv).toEqual(['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/mod-obw-issue-pane.md']); expect(nodesOf(await $.ui.render(PANE), 'Select')[1].props.value).toBe('pm/cc-plugins/tasks/mod-obw-issue-pane.md') })
  test('draws row paths unchanged', async ($, on) => { world(on, { query: '[{"path":"pm/cc-plugins/tasks/ab.md"}]' }); await issue($, ''); expect(nodesOf(await $.ui.render(PANE), 'Select')[1].props.options).toEqual([{ value: 'pm/cc-plugins/tasks/ab.md', label: 'ab' }]) })
  test('draws bounded external text', async ($, on) => { world(on, { read: `---\ntitle: a\r\n---\n${'x'.repeat(11000)}` }); await issue($, 'k'); const drawn = await text($); expect(drawn.every((x: string) => x.length <= 10000 && !/[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(x))).toBe(true); expect(drawn).toContain('Clipped: showing 10000 of 11000 characters.') })
  test('keeps unrelated panes untouched', async ($, on) => { world(on); on('ui.render', { component: 'Pane' }, () => ({ type: 'Text', children: ['beneath'] })); await $.session.start(SESSION); expect(await $.ui.render({ ...PANE, requestId: 'other' })).toEqual({ type: 'Text', children: ['beneath'] }) })
})
