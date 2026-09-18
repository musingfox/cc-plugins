import { describe, expect, test } from 'claude-code/testing'
import { remainingShareOf } from '../hooks/usage.ts'

describe('remainingShareOf', () => {
  test('prefers remainingFraction', () => {
    // The kit has no toBeCloseTo; this is its default precision (2 digits).
    expect(Math.abs(remainingShareOf({ remainingFraction: 0.06000000000000005, usedFraction: 0.94 })! - 0.06)).toBeLessThan(0.005)
  })

  test('falls back to one minus usedFraction', () => {
    expect(remainingShareOf({ used: 100, usedFraction: 1, unit: 'percent' })).toBe(0)
  })

  test('clamps an overdrawn usedFraction to zero', () => {
    expect(remainingShareOf({ usedFraction: 1.009 })).toBe(0)
  })

  test('is none when neither fraction is given', () => {
    expect(remainingShareOf({ used: 0, unit: 'requests' })).toBe(null)
  })

  test('clamps a remainingFraction above one', () => {
    expect(remainingShareOf({ remainingFraction: 1.2 })).toBe(1)
  })

  test('ignores a remainingFraction that is not a number', () => {
    expect(remainingShareOf({ remainingFraction: 'x', usedFraction: 0.25 })).toBe(0.75)
  })

  test('is none for a missing amount', () => {
    expect(remainingShareOf(undefined)).toBe(null)
  })
})
