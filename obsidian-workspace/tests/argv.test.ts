import { expect, test } from 'claude-code/testing'
import { listArgv, cardArgv } from '../hooks/argv.ts'
const list = ['obsidian', 'vault=obsidian', 'search', 'query=[type:task] [project:cc-plugins] -[status:done]', 'path=pm/cc-plugins', 'format=json']
test('builds a scoped list argv', () => expect(listArgv('obsidian', 'cc-plugins')).toEqual({ argv: list }))
test('refuses an empty list project', () => expect(listArgv('obsidian', '')).toEqual({ refused: 'project' }))
test('refuses a slash list project', () => expect(listArgv('obsidian', 'a/b')).toEqual({ refused: 'project' }))
test('refuses dot-dot list project', () => expect(listArgv('obsidian', '..')).toEqual({ refused: 'project' }))
test('refuses bracket list project', () => expect(listArgv('obsidian', 'x]y')).toEqual({ refused: 'project' }))
test('refuses spaced list project', () => expect(listArgv('obsidian', 'my project')).toEqual({ refused: 'project' }))
test('refuses empty list vault', () => expect(listArgv('', 'cc-plugins')).toEqual({ refused: 'vault' }))
test('keeps a literal vault in list argv', () => expect(listArgv('My Vault', 'p')).toEqual({ argv: ['obsidian', 'vault=My Vault', 'search', 'query=[type:task] [project:p] -[status:done]', 'path=pm/p', 'format=json'] }))
test('builds literal card argv', () => expect(cardArgv('obsidian', 'cc-plugins', 'mod-obw-issue-pane')).toEqual({ argv: ['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/mod-obw-issue-pane.md'] }))
test('refuses empty card', () => expect(cardArgv('obsidian', 'cc-plugins', '')).toEqual({ refused: 'card' }))
test('refuses slash card', () => expect(cardArgv('obsidian', 'cc-plugins', 'a/b')).toEqual({ refused: 'card' }))
test('refuses dot-dot card', () => expect(cardArgv('obsidian', 'cc-plugins', '..')).toEqual({ refused: 'card' }))
test('refuses control card', () => expect(cardArgv('obsidian', 'cc-plugins', 'a\u001bb')).toEqual({ refused: 'card' }))
test('refuses empty card project', () => expect(cardArgv('obsidian', '', 'x')).toEqual({ refused: 'project' }))
test('allows spaces in card names', () => expect(cardArgv('obsidian', 'cc-plugins', 'my card')).toEqual({ argv: ['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/my card.md'] }))
test('never emits an empty or file target', () => { for (const result of [listArgv('obsidian', 'cc-plugins'), cardArgv('obsidian', 'cc-plugins', 'mod-obw-issue-pane')]) if ('argv' in result) for (const arg of result.argv) { expect(arg.startsWith('file=')).toBe(false); expect(arg).not.toBe('path='); expect(arg.endsWith('/.md')).toBe(false) } })
