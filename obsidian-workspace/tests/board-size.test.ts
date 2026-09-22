import { expect, test } from 'claude-code/testing'
import { boardSize } from '../hooks/board-size.ts'

const NOTICE = '1 row of the All Tasks view is not a card under pm/cc-plugins and was left out.'

test('fills the body less the views Select row', () => {
  expect(boardSize({ bodyRows: 30, bodyColumns: 80, siblings: [], argumentCard: false })).toEqual({ rows: 29, columns: 80 })
})

test('leaves a row for a sibling line that fits the width', () => {
  expect(boardSize({ bodyRows: 30, bodyColumns: 80, siblings: [NOTICE], argumentCard: false })).toEqual({ rows: 28, columns: 80 })
})

test('leaves the wrapped rows of a sibling line wider than the body', () => {
  expect(boardSize({ bodyRows: 12, bodyColumns: 50, siblings: [NOTICE], argumentCard: false })).toEqual({ rows: 9, columns: 50 })
})

test('falls back to a 24 by 80 body when the size is unknown', () => {
  expect(boardSize({ bodyRows: undefined, bodyColumns: undefined, siblings: [], argumentCard: false })).toEqual({ rows: 23, columns: 80 })
})

test('clamps the size to its bounds', () => {
  expect(boardSize({ bodyRows: 2, bodyColumns: 80, siblings: [], argumentCard: false }).rows).toBe(3)
  expect(boardSize({ bodyRows: 400, bodyColumns: 1000, siblings: [], argumentCard: false })).toEqual({ rows: 150, columns: 300 })
})

test('caps the list at eight rows under an argument card', () => {
  expect(boardSize({ bodyRows: 30, bodyColumns: 80, siblings: [], argumentCard: true }).rows).toBe(8)
})
