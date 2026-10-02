import { describe, expect, test } from 'claude-code/testing'
import { arrowMove, backTarget, closeGoesBack, nextRing, reorderTarget, submitTarget } from '../hooks/ring.ts'

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

describe('submitTarget', () => {
  test('takes the first row under the first heading', () =>
    expect(submitTarget([{ key: 'group:0:todo', kind: 'heading' }, { key: 'row:a', kind: 'row' }])).toBe('row:a'))
  test('stays on a folded first heading', () =>
    expect(submitTarget([{ key: 'group:0:done', kind: 'heading' }, { key: 'group:0:todo', kind: 'heading' }, { key: 'row:a', kind: 'row' }])).toBe('group:0:done'))
  test('stays in the filter with nothing to take', () => expect(submitTarget([])).toBe(null))
})

describe('nextRing', () => {
  const held = { at: 'row:a', item: 'row:a' }
  test('records the first list item the ring lands on', () => expect(nextRing({ at: null, item: null }, 'row:a')).toEqual(held))
  test('keeps the last list item when the ring moves to a button', () => expect(nextRing(held, 'sort')).toEqual({ at: 'sort', item: 'row:a' }))
  test('keeps the last list item when the ring lands on an engine stop', () => expect(nextRing(held, undefined)).toEqual({ at: null, item: 'row:a' }))
  test('takes a heading as the last list item', () => expect(nextRing(held, 'group:0:done')).toEqual({ at: 'group:0:done', item: 'group:0:done' }))
})

describe('reorderTarget', () => {
  test('returns the card while it is still drawn', () => expect(reorderTarget('row:a', ['group:0:todo', 'row:b', 'row:a'])).toBe('row:a'))
  test('returns nothing once it is gone', () => expect(reorderTarget('row:a', ['group:0:todo', 'row:b'])).toBe(null))
  test('returns nothing when the ring held no card', () => expect(reorderTarget(null, ['group:0:todo'])).toBe(null))
})

describe('backTarget', () => {
  const A = 'pm/cc-plugins/tasks/a.md'
  test('goes to back while a card remains', () => expect(backTarget([A, 'pm/cc-plugins/tasks/archive/p.md'], ['group:0:todo'])).toBe('back'))
  test('goes to the row left when the list returns', () => expect(backTarget([A], ['group:0:todo', `row:${A}`])).toBe(`row:${A}`))
  test('goes to the first item when the row is folded away', () =>
    expect(backTarget(['pm/cc-plugins/tasks/e.md'], ['group:0:todo', 'group:0:done'])).toBe('group:0:todo'))
  test('goes nowhere from an empty trail', () => expect(backTarget([], ['group:0:todo'])).toBe(null))
})

describe('closeGoesBack', () => {
  test('goes back from a card', () => expect(closeGoesBack({ kind: 'person' }, 1)).toBe(true))
  test('closes from the list', () => expect(closeGoesBack({ kind: 'person' }, 0)).toBe(false))
  test('lets the plugin close a card', () => expect(closeGoesBack({ kind: 'plugin' }, 2)).toBe(false))
  test('always closes on unload', () => expect(closeGoesBack({ kind: 'unload' }, 2)).toBe(false))
})
