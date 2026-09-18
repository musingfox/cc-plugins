import { expect, test } from 'claude-code/testing'
import { headerOf } from '../hooks/card.ts'
test('reads card header', () => expect(headerOf('title: Fix #12 now\nstatus: todo')).toEqual({ title: 'Fix #12 now', status: 'todo', priority: undefined }))
