import { describe, expect, test } from 'claude-code/testing'
import {
  bestMove,
  CLOSED_NOTE,
  emptyBoard,
  isFiveAt,
  isMyTurn,
  moveCursor,
  newGame,
  newSoloGame,
  place,
  playSolo,
  reconcile,
  SIZE,
  snapshotOf,
  winnerOf,
} from '../hooks/gomoku.ts'
import type { View } from '../hooks/gomoku.ts'
import type { Gomoku } from '../types'

const at = (r: number, c: number) => r * SIZE + c

function boardWith(stones: [number, string][]): string {
  const cells = emptyBoard().split('')
  for (const [k, s] of stones) cells[k] = s
  return cells.join('')
}

const ready = (seat: 0 | 1 = 0): Gomoku => newGame('abcd12', seat, ['Ann', 'Bob'])

const view = (g: Gomoku, patch: Partial<View> = {}): View => ({
  seq: g.seq,
  snapshot: snapshotOf(g),
  names: g.names,
  you: g.seat,
  ...patch,
})

describe('rules', () => {
  test('five in a row wins along every direction, four does not', () => {
    const row = [0, 1, 2, 3, 4].map((i): [number, string] => [at(7, 3 + i), 'x'])
    expect(isFiveAt(boardWith(row), at(7, 5))).toBe(true)
    expect(isFiveAt(boardWith(row.slice(0, 4)), at(7, 5))).toBe(false)
    const diag = [0, 1, 2, 3, 4].map((i): [number, string] => [at(2 + i, 10 - i), 'o'])
    expect(isFiveAt(boardWith(diag), at(4, 8))).toBe(true)
    const col = [0, 1, 2, 3, 4, 5].map((i): [number, string] => [at(9 + i, 0), 'x'])
    expect(isFiveAt(boardWith(col), at(14, 0))).toBe(true)
  })

  test('a row does not wrap from one line to the next', () => {
    const wrapped = [at(0, 12), at(0, 13), at(0, 14), at(1, 0), at(1, 1)].map((k): [number, string] => [k, 'x'])
    expect(isFiveAt(boardWith(wrapped), at(0, 14))).toBe(false)
  })

  test('the winner is the seat whose stone made five', () => {
    const board = boardWith([0, 1, 2, 3, 4].map((i): [number, string] => [at(0, i), 'o']))
    expect(winnerOf({ board, last: at(0, 4) })).toBe(1)
    expect(winnerOf({ board, last: null })).toBe(null)
  })
})

describe('turns', () => {
  test('black moves first, and only once the opponent has joined', () => {
    expect(isMyTurn(ready(0))).toBe(true)
    expect(isMyTurn(ready(1))).toBe(false)
    expect(isMyTurn({ ...ready(0), names: ['Ann', null] })).toBe(false)
  })

  test('place puts the stone at the cursor and hands the turn over', () => {
    const g = place(ready(0))!
    expect(g.board[g.cursor]).toBe('x')
    expect(g).toMatchObject({ seq: 1, last: g.cursor, isSynced: false })
    expect(isMyTurn(g)).toBe(false)
    expect(place(g)).toBe(null)
  })

  test('an occupied cell takes no stone', () => {
    const g = { ...ready(0), board: boardWith([[ready().cursor, 'o']]) }
    expect(place(g)).toBe(null)
  })

  test('the cursor stops at the edges', () => {
    const corner = { ...ready(), cursor: 0 }
    expect(moveCursor(corner, 'up').cursor).toBe(0)
    expect(moveCursor(corner, 'left').cursor).toBe(0)
    expect(moveCursor(corner, 'right').cursor).toBe(1)
    expect(moveCursor(corner, 'down').cursor).toBe(SIZE)
  })
})

describe('reconcile', () => {
  test('takes the opponent move that follows the rules', () => {
    const mine = ready(1)
    const theirs = place(ready(0))!
    const step = reconcile(mine, view(theirs, { you: 1 }))
    expect(step.send).toBe('none')
    expect(step.game).toMatchObject({ seq: 1, board: theirs.board, last: theirs.last, isSynced: true })
    expect(isMyTurn(step.game)).toBe(true)
  })

  test('refuses a move that adds two stones or the wrong colour', () => {
    const mine = ready(1)
    const two = { ...ready(0), seq: 1, last: at(0, 0), board: boardWith([[at(0, 0), 'x'], [at(0, 1), 'x']]) }
    expect(reconcile(mine, view(two, { you: 1 })).game).toMatchObject({ seq: 0, note: expect.any(String) })
    const white = { ...ready(0), seq: 1, last: at(0, 0), board: boardWith([[at(0, 0), 'o']]) }
    expect(reconcile(mine, view(white, { you: 1 })).game.seq).toBe(0)
  })

  test('a room one move behind gets the unsent move again', () => {
    const moved = place(ready(0))!
    expect(reconcile(moved, view(ready(0))).send).toBe('move')
  })

  test('a room that no longer seats the client, or lost its moves, has closed', () => {
    const moved = place(ready(0))!
    expect(reconcile(moved, view(moved, { you: null })).game).toMatchObject({ isClosed: true, note: CLOSED_NOTE })
    const far = { ...moved, seq: 3, isSynced: true }
    expect(reconcile(far, view(ready(0))).game.isClosed).toBe(true)
    expect(isMyTurn({ ...ready(0), isClosed: true })).toBe(false)
  })

  test('a room in step marks the client synced and carries the names', () => {
    const moved = place(ready(0))!
    const step = reconcile(moved, view(moved, { names: ['Ann', 'Bobby'] }))
    expect(step.game).toMatchObject({ isSynced: true, names: ['Ann', 'Bobby'] })
  })

  test('a client more than one move behind takes the room as it is', () => {
    const far = { ...ready(0), seq: 4, last: at(1, 1), board: boardWith([[at(0, 0), 'x'], [at(0, 1), 'o'], [at(1, 0), 'x'], [at(1, 1), 'o']]) }
    expect(reconcile(ready(0), view(far)).game).toMatchObject({ seq: 4, board: far.board })
  })

  test('refuses a snapshot that is not a board', () => {
    expect(reconcile(ready(1), { seq: 1, snapshot: '{"board":"nope","last":0}', names: ['Ann', 'Bob'], you: 1 }).game.seq).toBe(0)
  })
})

describe('the computer', () => {
  const row = (r: number, cols: number[], s: string) => cols.map((c): [number, string] => [at(r, c), s])

  test('completes its own five before anything else', () => {
    const board = boardWith([...row(3, [2, 3, 4, 5], 'o'), ...row(9, [2, 3, 4, 5], 'x')])
    expect([at(3, 1), at(3, 6)]).toContain(bestMove(board, 'o'))
  })

  test("blocks the player's four", () => {
    const board = boardWith([...row(9, [2, 3, 4, 5], 'x'), [at(0, 0), 'o']])
    expect([at(9, 1), at(9, 6)]).toContain(bestMove(board, 'o'))
  })

  test('blocks an open three before it becomes an open four', () => {
    const board = boardWith([...row(7, [5, 6, 7], 'x'), [at(0, 0), 'o']])
    expect([at(7, 4), at(7, 8)]).toContain(bestMove(board, 'o'))
  })

  test('plays next to the stones, never far away', () => {
    const k = bestMove(boardWith([[at(7, 7), 'x']]), 'o')
    expect(Math.abs(Math.floor(k / SIZE) - 7)).toBeLessThanOrEqual(1)
    expect(Math.abs((k % SIZE) - 7)).toBeLessThanOrEqual(1)
  })
})

describe('solo', () => {
  test('the player takes black against the computer, and every move gets an answer', () => {
    const g = newSoloGame('Ann')
    expect(g).toMatchObject({ isSolo: true, seat: 0, names: ['Ann', 'Computer'] })
    const after = playSolo(g)!
    expect(after.seq).toBe(2)
    expect(after.board.split('').filter((c) => c !== '.').sort()).toEqual(['o', 'x'])
    expect(isMyTurn(after)).toBe(true)
  })

  test('a winning move ends the game with no answer', () => {
    const board = boardWith(row4())
    const g = { ...newSoloGame('Ann'), board, seq: 8, cursor: at(7, 7) }
    const after = playSolo(g)!
    expect(after.seq).toBe(9)
    expect(winnerOf(after)).toBe(0)
  })

  test('an occupied cell takes no move', () => {
    const g = { ...newSoloGame('Ann'), board: boardWith([[at(7, 7), 'o']]) }
    expect(playSolo(g)).toBe(null)
  })
})

function row4(): [number, string][] {
  return [
    ...[3, 4, 5, 6].map((c): [number, string] => [at(7, c), 'x']),
    ...[0, 1, 2, 3].map((c): [number, string] => [at(0, c * 2), 'o']),
  ]
}
