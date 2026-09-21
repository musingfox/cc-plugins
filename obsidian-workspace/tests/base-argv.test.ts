import { expect, test } from 'claude-code/testing'
import { baseQueryArgv, cardPathArgv, viewsArgv } from '../hooks/base-argv.ts'
import { bounded } from '../hooks/bounds.ts'

const SCOPE = { vault: 'obsidian', project: 'cc-plugins' }

test('builds a dashboard query', () => expect(baseQueryArgv(SCOPE, 'Active')).toEqual({ argv: ['obsidian', 'vault=obsidian', 'base:query', 'path=pm/cc-plugins/dashboard.base', 'view=Active', 'format=json'] }))
test('accepts spaces in a view name', () => expect(baseQueryArgv(SCOPE, 'Recently Completed').argv?.[4]).toBe('view=Recently Completed'))
test('refuses an empty view', () => expect(baseQueryArgv(SCOPE, '')).toEqual({ refused: 'view' }))
test('refuses an ESC in a view', () => expect(baseQueryArgv(SCOPE, 'A\u001bB')).toEqual({ refused: 'view' }))
test('refuses a tab in a view', () => expect(baseQueryArgv(SCOPE, 'A\tB')).toEqual({ refused: 'view' }))
test('refuses an overlong view', () => expect(baseQueryArgv(SCOPE, 'x'.repeat(10001))).toEqual({ refused: 'view' }))
test('refuses brackets in a project', () => expect(baseQueryArgv({ vault: 'obsidian', project: 'x]y' }, 'Active')).toEqual({ refused: 'project' }))
test('refuses spaces in a project', () => expect(baseQueryArgv({ vault: 'obsidian', project: 'my project' }, 'Active')).toEqual({ refused: 'project' }))
test('refuses an empty vault', () => expect(baseQueryArgv({ vault: '', project: 'cc-plugins' }, 'Active')).toEqual({ refused: 'vault' }))

test('builds a read argv from a row path', () => expect(cardPathArgv(SCOPE, 'pm/cc-plugins/tasks/a.md')).toEqual({ argv: ['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/a.md'] }))
test('accepts nested task paths', () => expect(cardPathArgv(SCOPE, 'pm/cc-plugins/tasks/archive/adr-three-conditions-audit.md')).toHaveProperty('argv'))
test('accepts non-task row paths', () => expect(cardPathArgv(SCOPE, 'pm/cc-plugins/docs/mattpocock-skills-import.md')).toHaveProperty('argv'))
test('refuses a path under a different project', () => expect(cardPathArgv({ vault: 'obsidian', project: 'cc' }, 'pm/cc-plugins/tasks/a.md')).toEqual({ refused: 'path' }))
test('accepts spaces in a basename', () => expect(cardPathArgv(SCOPE, 'pm/cc-plugins/tasks/my card.md')).toEqual({ argv: ['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/my card.md'] }))
test('refuses an empty card project', () => expect(cardPathArgv({ vault: 'obsidian', project: '' }, 'pm/cc-plugins/tasks/a.md')).toEqual({ refused: 'project' }))
test('refuses an empty card vault', () => expect(cardPathArgv({ vault: '', project: 'cc-plugins' }, 'pm/cc-plugins/tasks/a.md')).toEqual({ refused: 'vault' }))
for (const path of ['', 'pm/other/tasks/a.md', 'pm/cc-plugins/tasks/../../secrets/a.md', 'pm/cc-plugins/tasks/a\u0001b.md', 'pm/cc-plugins/tasks/a\tb.md', 'pm/cc-plugins/tasks/a.txt', 'pm/cc-plugins/tasks/.md', 'pm/cc-plugins//tasks/a.md']) test(`refuses unsafe row path ${JSON.stringify(path)}`, () => expect(cardPathArgv(SCOPE, path)).toEqual({ refused: 'path' }))

test('never builds an ambiguous target', () => {
  const built = [baseQueryArgv(SCOPE, 'Active'), cardPathArgv(SCOPE, 'pm/cc-plugins/tasks/a.md')]
  for (const result of built) if ('argv' in result) for (const arg of result.argv) {
    expect(arg).not.toBe('path=')
    expect(arg.startsWith('file=')).toBe(false)
    expect(arg.endsWith('/.md')).toBe(false)
    expect(arg).not.toBe('view=')
  }
})

for (const path of ['pm/cc-plugins/tasks/a.md', 'pm/cc-plugins/tasks/archive/adr-three-conditions-audit.md', 'pm/cc-plugins/docs/mattpocock-skills-import.md', 'pm/cc-plugins/tasks/my card.md']) test(`preserves accepted row path ${path}`, () => expect(bounded(path).text).toBe(path))

test('builds a dashboard views argv', () => expect(viewsArgv(SCOPE)).toEqual({ argv: ['obsidian', 'vault=obsidian', 'base:views', 'path=pm/cc-plugins/dashboard.base'] }))
test('refuses an empty views vault', () => expect(viewsArgv({ vault: '', project: 'cc-plugins' })).toEqual({ refused: 'vault' }))
test('refuses an empty views project', () => expect(viewsArgv({ vault: 'obsidian', project: '' })).toEqual({ refused: 'project' }))
test('refuses a slash in a views project', () => expect(viewsArgv({ vault: 'obsidian', project: 'a/b' })).toEqual({ refused: 'project' }))
test('refuses brackets in a views project', () => expect(viewsArgv({ vault: 'obsidian', project: 'x]y' })).toEqual({ refused: 'project' }))
