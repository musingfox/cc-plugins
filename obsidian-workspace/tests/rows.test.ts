import { expect, test } from 'claude-code/testing'
import { resolveArgument } from '../hooks/rows.ts'

test('resolves an empty argument to no selection', () => {
  expect(resolveArgument('', ['Active', 'Docs'])).toEqual({ kind: 'none' })
  expect(resolveArgument('   ', ['Active', 'Docs'])).toEqual({ kind: 'none' })
})

test('resolves exact view names before card names', () => {
  expect(resolveArgument('Docs', ['Active', 'Docs'])).toEqual({ kind: 'view', view: 'Docs' })
  expect(resolveArgument('By Parent', ['Active', 'By Parent'])).toEqual({ kind: 'view', view: 'By Parent' })
  expect(resolveArgument('Active', ['Active'])).toEqual({ kind: 'view', view: 'Active' })
})

test('resolves other arguments as case-sensitive card names', () => {
  expect(resolveArgument('mod-obw-issue-pane', ['Active', 'Docs'])).toEqual({ kind: 'card', card: 'mod-obw-issue-pane' })
  expect(resolveArgument('docs', ['Active', 'Docs'])).toEqual({ kind: 'card', card: 'docs' })
  expect(resolveArgument('Active', [])).toEqual({ kind: 'card', card: 'Active' })
})
