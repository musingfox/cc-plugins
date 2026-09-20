import { expect, test } from 'claude-code/testing'
import * as argv from '../hooks/argv.ts'
import { isBadCardName, taskFolder } from '../hooks/argv.ts'
import { baseQueryArgv, cardPathArgv, viewsArgv } from '../hooks/base-argv.ts'

test('removes legacy list argv but keeps card-name validation', () => {
  expect('listArgv' in argv).toBe(false)
  expect('isBadCardName' in argv).toBe(true)
})

test('removes legacy card argv but keeps task folders', () => {
  expect('cardArgv' in argv).toBe(false)
  expect('taskFolder' in argv).toBe(true)
})

test('refuses an empty card name', () => expect(isBadCardName('')).toBe(true))
test('refuses a slash card name', () => expect(isBadCardName('a/b')).toBe(true))
test('refuses a dot card name', () => expect(isBadCardName('.')).toBe(true))
test('refuses a dot-dot card name', () => expect(isBadCardName('..')).toBe(true))
test('refuses a control card name', () => expect(isBadCardName('a\u001bb')).toBe(true))
test('allows spaces in card names', () => expect(isBadCardName('my card')).toBe(false))
test('allows a plain card name', () => expect(isBadCardName('mod-obw-issue-pane')).toBe(false))

test('names the task folder under the project', () => {
  expect(taskFolder('cc-plugins')).toBe('pm/cc-plugins/tasks/')
  expect(`${taskFolder('cc-plugins')}mod-obw-issue-pane.md`).toBe('pm/cc-plugins/tasks/mod-obw-issue-pane.md')
})

test('never emits an empty or file target', () => {
  const built = [
    baseQueryArgv('obsidian', 'cc-plugins', 'Active'),
    cardPathArgv('obsidian', 'cc-plugins', `${taskFolder('cc-plugins')}mod-obw-issue-pane.md`),
    cardPathArgv('obsidian', 'cc-plugins', `${taskFolder('cc-plugins')}my card.md`),
    viewsArgv('obsidian', 'cc-plugins'),
  ]
  for (const result of built) {
    expect(result).toHaveProperty('argv')
    if ('argv' in result) for (const arg of result.argv) {
      expect(arg.startsWith('file=')).toBe(false)
      expect(arg).not.toBe('path=')
      expect(arg.endsWith('/.md')).toBe(false)
    }
  }
})
