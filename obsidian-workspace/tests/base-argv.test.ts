import { expect, test } from 'claude-code/testing'
import { baseQueryArgv } from '../hooks/base-argv.ts'

test('builds a dashboard query', () => expect(baseQueryArgv('obsidian', 'cc-plugins', 'Active')).toEqual({ argv: ['obsidian', 'vault=obsidian', 'base:query', 'path=pm/cc-plugins/dashboard.base', 'view=Active', 'format=json'] }))
test('accepts spaces in a view name', () => expect(baseQueryArgv('obsidian', 'cc-plugins', 'Recently Completed').argv?.[4]).toBe('view=Recently Completed'))
test('refuses an empty view', () => expect(baseQueryArgv('obsidian', 'cc-plugins', '')).toEqual({ refused: 'view' }))
test('refuses an ESC in a view', () => expect(baseQueryArgv('obsidian', 'cc-plugins', 'A\u001bB')).toEqual({ refused: 'view' }))
test('refuses a tab in a view', () => expect(baseQueryArgv('obsidian', 'cc-plugins', 'A\tB')).toEqual({ refused: 'view' }))
test('refuses an overlong view', () => expect(baseQueryArgv('obsidian', 'cc-plugins', 'x'.repeat(10001))).toEqual({ refused: 'view' }))
test('refuses brackets in a project', () => expect(baseQueryArgv('obsidian', 'x]y', 'Active')).toEqual({ refused: 'project' }))
test('refuses spaces in a project', () => expect(baseQueryArgv('obsidian', 'my project', 'Active')).toEqual({ refused: 'project' }))
test('refuses an empty vault', () => expect(baseQueryArgv('', 'cc-plugins', 'Active')).toEqual({ refused: 'vault' }))
