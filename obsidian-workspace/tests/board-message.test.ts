import { expect, test } from 'claude-code/testing'
import { boardMessage } from '../hooks/board-message.ts'

const P = (name: string) => `pm/cc-plugins/tasks/${name}.md`
const post = (data: unknown) => ({ requestId: 'obw-issue', element: 'board', data })

test('opens a listed path', () => {
  expect(boardMessage(post({ open: P('a') }), [P('a')])).toEqual({ kind: 'open', path: P('a') })
})

test('ignores another pane', () => {
  expect(boardMessage({ ...post({ open: P('a') }), requestId: 'other' }, [P('a')])).toBe(null)
})

test('ignores another client', () => {
  expect(boardMessage({ ...post({ open: P('a') }), element: 'x' }, [P('a')])).toBe(null)
})

test('ignores an open with no list drawn', () => {
  expect(boardMessage(post({ open: P('a') }), null)).toBe(null)
})

test('ignores an unlisted path', () => expect(boardMessage(post({ open: P('zz') }), [P('a')])).toBe(null))
test('ignores a non-string open', () => expect(boardMessage(post({ open: 123 }), [P('a')])).toBe(null))
test('ignores an escaping path', () => expect(boardMessage(post({ open: 'pm/cc-plugins/../x.md' }), [P('a')])).toBe(null))

test('goes back on back:true', () => expect(boardMessage(post({ back: true }), [P('a')])).toEqual({ kind: 'back' }))
test('ignores a truthy non-true back', () => expect(boardMessage(post({ back: 1 }), [P('a')])).toBe(null))
test('ignores open and back together', () => expect(boardMessage(post({ open: P('a'), back: true }), [P('a')])).toBe(null))
test('ignores null data', () => expect(boardMessage(post(null), [P('a')])).toBe(null))
test('ignores string data', () => expect(boardMessage(post('open'), [P('a')])).toBe(null))
test('ignores array data', () => expect(boardMessage(post([P('a')]), [P('a')])).toBe(null))
