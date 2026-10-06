import { describe, expect, test } from 'claude-code/testing'
import { canMove, move, newGame, slide, spawn } from '../hooks/game2048.ts'
import type { Board, Game } from '../types'

// Rows top to bottom, as the board reads.
function board(...rows: number[][]): Board {
  return rows.flat()
}

const EMPTY_ROW = [0, 0, 0, 0]

function sequence(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('slide', () => {
  test('left packs tiles and merges each pair once', () => {
    const slid = slide(board([2, 2, 4, 0], [2, 2, 2, 2], [0, 0, 0, 8], [4, 0, 4, 4]), 'left')
    expect(slid.board).toEqual(board([4, 4, 0, 0], [4, 4, 0, 0], [8, 0, 0, 0], [8, 4, 0, 0]))
    expect(slid.gained).toBe(4 + 8 + 8)
    expect(slid.moved).toBe(true)
  })

  test('right merges from the right edge first', () => {
    const slid = slide(board([2, 2, 2, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW), 'right')
    expect(slid.board).toEqual(board([0, 0, 2, 4], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW))
  })

  test('up and down work on columns', () => {
    const start = board([2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], EMPTY_ROW)
    expect(slide(start, 'up').board).toEqual(board([4, 0, 0, 0], [4, 0, 0, 0], EMPTY_ROW, EMPTY_ROW))
    expect(slide(start, 'down').board).toEqual(board(EMPTY_ROW, EMPTY_ROW, [4, 0, 0, 0], [4, 0, 0, 0]))
  })

  test('a slide that changes nothing has not moved', () => {
    const slid = slide(board([2, 4, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW), 'left')
    expect(slid.moved).toBe(false)
    expect(slid.gained).toBe(0)
  })
})

describe('spawn', () => {
  test('puts a 2 in an empty cell nine times in ten, else a 4', () => {
    const full = board([0, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 2], [2, 2, 2, 0])
    expect(spawn(full, sequence(0, 0.5))[0]).toBe(2)
    expect(spawn(full, sequence(0.99, 0.95))[15]).toBe(4)
  })

  test('leaves a full board alone', () => {
    const full = Array(16).fill(2)
    expect(spawn(full, Math.random)).toEqual(full)
  })
})

describe('newGame', () => {
  test('starts with two tiles and no score', () => {
    const g = newGame(Math.random)
    expect(g.board.filter((v) => v !== 0)).toHaveLength(2)
    expect(g.score).toBe(0)
  })
})

describe('move', () => {
  const game = (b: Board): Game => ({ board: b, score: 10, hasWon: false, isOver: false })

  test('adds the merged value to the score and spawns one tile', () => {
    const after = move(game(board([2, 2, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW)), 'left', sequence(0, 0))
    expect(after.score).toBe(14)
    expect(after.board.filter((v) => v !== 0)).toHaveLength(2)
  })

  test('a move that slides nothing spawns nothing', () => {
    const before = game(board([2, 4, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW))
    expect(move(before, 'left', sequence(0))).toBe(before)
  })

  test('reaching 2048 wins and play goes on', () => {
    const after = move(game(board([1024, 1024, 0, 0], EMPTY_ROW, EMPTY_ROW, EMPTY_ROW)), 'left', sequence(0))
    expect(after.hasWon).toBe(true)
    expect(after.isOver).toBe(false)
  })

  test('a full board with no pair is over', () => {
    const stuck = board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [0, 8, 2, 8])
    expect(canMove(stuck)).toBe(true)
    // Sliding left leaves only the corner free, and the 2 spawned there has no match.
    const after = move(game(stuck), 'left', sequence(0, 0))
    expect(after.board).toEqual(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [8, 2, 8, 2]))
    expect(after.isOver).toBe(true)
  })
})
