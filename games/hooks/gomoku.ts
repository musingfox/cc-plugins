import type { Gomoku } from '../types'

export const SIZE = 15
const CELLS = SIZE * SIZE
const EMPTY = '.'
// Seat 0 plays black and moves first.
export const STONES = ['x', 'o'] as const

export type View = { seq: number; snapshot: string | null; names: [string | null, string | null]; you: 0 | 1 | null }
type Snap = { board: string; last: number | null }

export const emptyBoard = () => EMPTY.repeat(CELLS)

const CENTRE = Math.floor(CELLS / 2)

export function newGame(code: string, seat: 0 | 1, names: Gomoku['names']): Gomoku {
  return { code, seat, seq: 0, board: emptyBoard(), last: null, names, cursor: CENTRE, isSynced: true, isClosed: false, isSolo: false, note: null }
}

export const COMPUTER = 'Computer'

// The player takes black and moves first.
export const newSoloGame = (name: string): Gomoku => ({ ...newGame('', 0, [name, COMPUTER]), isSolo: true })

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

const putAt = (g: Gomoku, at: number, stone: string): Gomoku => ({
  ...g,
  board: g.board.slice(0, at) + stone + g.board.slice(at + 1),
  last: at,
  seq: g.seq + 1,
  isSynced: false,
  note: null,
})

export function place(g: Gomoku): Gomoku | null {
  if (!isMyTurn(g) || g.board[g.cursor] !== EMPTY) return null
  return putAt(g, g.cursor, STONES[g.seat])
}

// The run `stone` would make through `at` along one direction, and how many of its two
// ends are open.
function runAt(board: string, at: number, stone: string, dr: number, dc: number): { length: number; open: number } {
  const r0 = Math.floor(at / SIZE)
  const c0 = at % SIZE
  let length = 1
  let open = 0
  for (const sign of [1, -1]) {
    let r = r0 + dr * sign
    let c = c0 + dc * sign
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === stone) {
      length++
      r += dr * sign
      c += dc * sign
    }
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === EMPTY) open++
  }
  return { length, open }
}

// What a run is worth: five wins outright, an open four cannot be stopped, and so down.
function worth({ length, open }: { length: number; open: number }): number {
  if (length >= 5) return 1_000_000
  if (open === 0) return 0
  const table: Record<number, [number, number]> = { 4: [10_000, 100_000], 3: [500, 5_000], 2: [50, 200], 1: [2, 10] }
  return table[length]![open - 1]!
}

const valueAt = (board: string, at: number, stone: string) =>
  DIRS.reduce((sum, [dr, dc]) => sum + worth(runAt(board, at, stone, dr, dc)), 0)

// The computer's move: the empty cell near the stones that best builds its own lines or
// breaks the player's, ties going to the cell nearest the centre.
export function bestMove(board: string, stone: string): number {
  const other = stone === STONES[0] ? STONES[1] : STONES[0]
  const near = (k: number) => {
    const r = Math.floor(k / SIZE)
    const c = k % SIZE
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr
        const cc = c + dc
        if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr * SIZE + cc] !== EMPTY) return true
      }
    return false
  }
  const centreDistance = (k: number) =>
    Math.abs(Math.floor(k / SIZE) - Math.floor(CENTRE / SIZE)) + Math.abs((k % SIZE) - (CENTRE % SIZE))
  let best = -1
  let bestScore = -1
  for (let k = 0; k < CELLS; k++) {
    if (board[k] !== EMPTY || !near(k)) continue
    const score = valueAt(board, k, stone) * 1.1 + valueAt(board, k, other)
    if (score > bestScore || (score === bestScore && centreDistance(k) < centreDistance(best))) {
      best = k
      bestScore = score
    }
  }
  return best === -1 ? CENTRE : best
}

// The player's stone at the cursor, then the computer's answer unless the game is over.
export function playSolo(g: Gomoku): Gomoku | null {
  const mine = place(g)
  if (!mine) return null
  if (isOver(mine)) return { ...mine, isSynced: true }
  const stone = STONES[1 - g.seat]!
  return { ...putAt(mine, bestMove(mine.board, stone), stone), isSynced: true }
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
