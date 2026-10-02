import { describe, expect, test } from 'claude-code/testing'
import { arrowMove } from '../hooks/ring.ts'

describe('arrowMove', () => {
  const items = ['group:0:todo', 'row:a', 'row:b']
  const person = { origin: { kind: 'person' as const }, by: 1 }
  const view = { isList: true, items, firstMatch: null, at: null as string | null }
  const move = (scroll: object, at: string | null, more: object = {}) => arrowMove({ ...person, ...scroll }, { ...view, at, ...more })

  test('leaves a wheel tick to the engine', () => expect(move({ pointer: { row: 3, column: 2 } }, 'row:a')).toBe(null))
  test('leaves a scroll the plugin raised to the engine', () => expect(move({ origin: { kind: 'plugin' } }, 'row:a')).toBe(null))
  test('leaves a page key to the engine', () => expect(move({ by: 30 }, 'row:a')).toBe(null))
  test('leaves a card to the engine', () => expect(move({}, 'row:a', { isList: false })).toBe(null))
  test('moves down one item', () => expect(move({}, 'row:a')).toBe('row:b'))
  test('leaves the last item to the engine', () => expect(move({}, 'row:b')).toBe(null))
  test('moves up from the first heading to the filter', () => expect(move({ by: -1 }, 'group:0:todo')).toBe('query'))
  test('leaves up from the filter to the engine', () => expect(move({ by: -1 }, 'query')).toBe(null))
  test('moves down from the filter to the first match', () => expect(move({}, 'query', { firstMatch: 'row:a' })).toBe('row:a'))
  test('enters the list from nowhere going down only', () => {
    expect(move({}, null)).toBe('group:0:todo')
    expect(move({ by: -1 }, null)).toBe(null)
  })
  test('enters the list from a toolbar button', () => expect(move({}, 'sort')).toBe('group:0:todo'))
})
