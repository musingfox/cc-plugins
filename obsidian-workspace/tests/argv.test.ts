import { expect, test } from 'claude-code/testing'
import * as argv from '../hooks/argv.ts'
import { baseQueryArgv, cardPathArgv, viewsArgv } from '../hooks/base-argv.ts'
test('removes legacy list argv but keeps card-name validation', () => { expect('listArgv' in argv).toBe(false); expect('isBadCardName' in argv).toBe(true) })
test('removes legacy card argv but keeps task folders', () => { expect('cardArgv' in argv).toBe(false); expect('taskFolder' in argv).toBe(true) })
test('refuses unsafe card names', () => { for (const value of ['a/b', '..', 'a\u001bb']) expect(argv.isBadCardName(value)).toBe(true) })
test('never emits an empty or file target', () => { for (const result of [baseQueryArgv('obsidian', 'cc-plugins', 'Active'), cardPathArgv('obsidian', 'cc-plugins', 'pm/cc-plugins/tasks/a.md'), viewsArgv('obsidian', 'cc-plugins')]) if ('argv' in result) for (const arg of result.argv) { expect(arg.startsWith('file=')).toBe(false); expect(arg).not.toBe('path=') } })
