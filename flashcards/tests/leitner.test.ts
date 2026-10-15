import { describe, expect, test } from 'claude-code/testing'
import { rate } from '../hooks/leitner.ts'

describe('rate', () => {
  test('a new card rated 3 moves to box 2, due a day later', () => {
    expect(rate(undefined, 3, 1000)).toEqual({ box: 2, due: 1000 + 86400000 })
  })

  test('a box-3 card rated 3 stays in box 3, due a week later', () => {
    expect(rate({ box: 3, due: 0 }, 3, 1000)).toEqual({ box: 3, due: 1000 + 604800000 })
  })

  test('a box-3 card rated 1 falls to box 1, due now', () => {
    expect(rate({ box: 3, due: 0 }, 1, 1000)).toEqual({ box: 1, due: 1000 })
  })

  test('rating 2 keeps the current box; a new card stays in box 1', () => {
    expect(rate({ box: 2, due: 0 }, 2, 1000)).toEqual({ box: 2, due: 1000 + 86400000 })
    expect(rate(undefined, 2, 1000)).toEqual({ box: 1, due: 1000 })
  })
})
