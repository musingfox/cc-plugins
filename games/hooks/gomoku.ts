import type { Gomoku } from '../types'

export const SIZE = 15
const CELLS = SIZE * SIZE
const EMPTY = '.'
// Seat 0 plays black and moves first.
export const STONES = ['x', 'o'] as const

export type View = { seq: number; snapshot: string | null; names: [string | null, string | null]; you: 0 | 1 | null }
type Snap = { board: string; last: number | null }

export const emptyBoard = () => EMPTY.repeat(CELLS)

export function newGame(code: string, seat: 0 | 1, names: Gomoku['names']): Gomoku {
  const centre = Math.floor(CELLS / 2)
  return { code, seat, seq: 0, board: emptyBoard(), last: null, names, cursor: centre, isSynced: true, isClosed: false, note: null }
}

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

// Five or more in a row through `at` wins: freestyle Gomoku.
export function isFiveAt(board: string, at: number): boolean {
  const stone = board[at]
  if (!stone || stone === EMPTY) return false
  const r0 = Math.floor(at / SIZE)
  const c0 = at % SIZE
  return DIRS.some(([dr, dc]) => {
    let run = 1
    for (const sign of [1, -1]) {
      for (let r = r0 + dr * sign, c = c0 + dc * sign; r >= 0 && r < SIZE && c >= 0 && c < SIZE; r += dr * sign, c += dc * sign) {
        if (board[r * SIZE + c] !== stone) break
        run++
      }
    }
    return run >= 5
  })
}

export function winnerOf(g: Pick<Gomoku, 'board' | 'last'>): 0 | 1 | null {
  if (g.last === null || !isFiveAt(g.board, g.last)) return null
  return g.board[g.last] === STONES[0] ? 0 : 1
}

export const isOver = (g: Gomoku) => winnerOf(g) !== null || !g.board.includes(EMPTY)
export const hasOpponent = (g: Gomoku) => g.names[1 - g.seat] !== null
export const isMyTurn = (g: Gomoku) => !g.isClosed && !isOver(g) && hasOpponent(g) && g.seq % 2 === g.seat

export function place(g: Gomoku): Gomoku | null {
  if (!isMyTurn(g) || g.board[g.cursor] !== EMPTY) return null
  const board = g.board.slice(0, g.cursor) + STONES[g.seat] + g.board.slice(g.cursor + 1)
  return { ...g, board, last: g.cursor, seq: g.seq + 1, isSynced: false, note: null }
}

export function moveCursor(g: Gomoku, dir: 'up' | 'down' | 'left' | 'right'): Gomoku {
  const r = Math.floor(g.cursor / SIZE)
  const c = g.cursor % SIZE
  const nr = Math.min(SIZE - 1, Math.max(0, r + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0)))
  const nc = Math.min(SIZE - 1, Math.max(0, c + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0)))
  return { ...g, cursor: nr * SIZE + nc }
}

export const snapshotOf = (g: Gomoku) => JSON.stringify({ board: g.board, last: g.last } satisfies Snap)

function parseSnap(text: string | null): Snap | null {
  try {
    const s = JSON.parse(text ?? '') as Snap
    const isBoard = typeof s.board === 'string' && s.board.length === CELLS && /^[.xo]+$/.test(s.board)
    const isLast = s.last === null || (Number.isInteger(s.last) && s.last >= 0 && s.last < CELLS)
    return isBoard && isLast ? s : null
  } catch {
    return null
  }
}

// The one move from `before` to `after`: exactly one new `stone` on an empty cell, at `last`.
function isOneMove(before: string, after: Snap, stone: string): boolean {
  if (after.last === null || after.board[after.last] !== stone || before[after.last] !== EMPTY) return false
  for (let k = 0; k < CELLS; k++) if (k !== after.last && after.board[k] !== before[k]) return false
  return true
}

export type Step = { game: Gomoku; send: 'none' | 'move' }

export const CLOSED_NOTE = 'The room closed after 15 minutes without a move.'

// What the room says against what this client holds. A room one move behind missed this
// client's last move and gets it again; a room one move ahead is checked against the rules;
// a room that no longer seats this client has closed.
export function reconcile(g: Gomoku, view: View): Step {
  if (view.you === null) return { game: { ...g, isClosed: true, note: CLOSED_NOTE }, send: 'none' }
  const named = { ...g, names: view.names }
  if (view.seq === g.seq - 1 && !g.isSynced) return { game: named, send: 'move' }
  if (view.seq < g.seq) return { game: { ...named, isClosed: true, note: CLOSED_NOTE }, send: 'none' }
  if (view.seq === g.seq) return { game: { ...named, isSynced: true }, send: 'none' }
  const snap = parseSnap(view.snapshot)
  const mover = STONES[(view.seq - 1) % 2]!
  const fits = snap && (view.seq > g.seq + 1 || isOneMove(g.board, snap, mover))
  if (!snap || !fits) return { game: { ...named, note: 'Refused a move that breaks the rules.' }, send: 'none' }
  return { game: { ...named, seq: view.seq, board: snap.board, last: snap.last, isSynced: true, note: null }, send: 'none' }
}
