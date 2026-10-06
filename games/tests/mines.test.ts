import { describe, expect, test } from 'claude-code/testing'
import { COLS, countAt, dig, flag, layMines, MINE_COUNT, moveCursor, neighbors, newMines, ROWS } from '../hooks/mines.ts'
import type { Mines } from '../types'

const CELLS = ROWS * COLS
const at = (r: number, c: number) => r * COLS + c

function withMines(mineCells: number[], patch: Partial<Mines> = {}): Mines {
  const mines = Array(CELLS).fill(false)
  for (const k of mineCells) mines[k] = true
  return { ...newMines(), mines, ...patch }
}

describe('neighbors', () => {
  test('a corner has 3, an edge 5, the middle 8', () => {
    expect(neighbors(at(0, 0)).sort((a, b) => a - b)).toEqual([at(0, 1), at(1, 0), at(1, 1)])
    expect(neighbors(at(0, 4))).toHaveLength(5)
    expect(neighbors(at(4, 4))).toHaveLength(8)
  })
})

describe('layMines', () => {
  test('lays the full count and keeps the first dig and its neighbors clear', () => {
    for (const r of [0, 0.5, 0.999]) {
      const safe = at(4, 4)
      const mines = layMines(safe, () => r)
      expect(mines.filter(Boolean)).toHaveLength(MINE_COUNT)
      for (const k of [safe, ...neighbors(safe)]) expect(mines[k]).toBe(false)
    }
  })
})

describe('dig', () => {
  test('the first dig lays the mines and never loses', () => {
    for (const r of [0, 0.3, 0.999]) {
      const after = dig(newMines(), () => r)
      expect(after.mines).not.toBeNull()
      expect(after.state).not.toBe('lost')
      expect(after.revealed[after.cursor]).toBe(true)
    }
  })

  test('a blank cell opens every connected blank and the numbers around them', () => {
    const after = dig(withMines([at(8, 8)], { cursor: at(0, 0) }), Math.random)
    expect(after.revealed.filter(Boolean)).toHaveLength(CELLS - 1)
    expect(after.state).toBe('won')
  })

  test('digging a mine loses and marks the one hit', () => {
    const after = dig(withMines([at(2, 2)], { cursor: at(2, 2) }), Math.random)
    expect(after.state).toBe('lost')
    expect(after.hit).toBe(at(2, 2))
  })

  test('a flagged cell does not dig', () => {
    const before = withMines([at(2, 2)], { cursor: at(2, 2) })
    const flagged = flag(before)
    expect(dig(flagged, Math.random)).toBe(flagged)
  })

  test('digging a number whose flags match opens its other neighbors', () => {
    const revealed = Array(CELLS).fill(false)
    revealed[at(1, 1)] = true
    const flagged = Array(CELLS).fill(false)
    flagged[at(0, 0)] = true
    const g = withMines([at(0, 0), at(8, 8)], { cursor: at(1, 1), revealed, flagged })
    expect(countAt(g.mines!, at(1, 1))).toBe(1)
    const after = dig(g, Math.random)
    expect(after.state).not.toBe('lost')
    for (const k of neighbors(at(1, 1)).filter((k) => k !== at(0, 0))) expect(after.revealed[k]).toBe(true)
  })

  test('a chord on a wrong flag hits the mine it left open', () => {
    const revealed = Array(CELLS).fill(false)
    revealed[at(1, 1)] = true
    const flagged = Array(CELLS).fill(false)
    flagged[at(0, 1)] = true
    const after = dig(withMines([at(0, 0)], { cursor: at(1, 1), revealed, flagged }), Math.random)
    expect(after.state).toBe('lost')
    expect(after.hit).toBe(at(0, 0))
  })

  test('a chord with too few flags does nothing', () => {
    const revealed = Array(CELLS).fill(false)
    revealed[at(1, 1)] = true
    const g = withMines([at(0, 0)], { cursor: at(1, 1), revealed })
    expect(dig(g, Math.random)).toBe(g)
  })

  test('a finished game takes no more digs', () => {
    const lost = withMines([at(0, 0)], { state: 'lost' })
    expect(dig(lost, Math.random)).toBe(lost)
  })
})

describe('flag', () => {
  test('toggles a hidden cell and leaves a shown one alone', () => {
    const g = withMines([], { cursor: at(3, 3) })
    expect(flag(g).flagged[at(3, 3)]).toBe(true)
    expect(flag(flag(g)).flagged[at(3, 3)]).toBe(false)
    const revealed = Array(CELLS).fill(false)
    revealed[at(3, 3)] = true
    const shown = { ...g, revealed }
    expect(flag(shown)).toBe(shown)
  })
})

describe('moveCursor', () => {
  test('moves one cell and stops at the edges', () => {
    const g = { ...newMines(), cursor: at(0, 0) }
    expect(moveCursor(g, 'up').cursor).toBe(at(0, 0))
    expect(moveCursor(g, 'left').cursor).toBe(at(0, 0))
    expect(moveCursor(g, 'down').cursor).toBe(at(1, 0))
    expect(moveCursor(g, 'right').cursor).toBe(at(0, 1))
  })
})
