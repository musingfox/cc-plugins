import type { Mines } from '../types'

export const ROWS = 9
export const COLS = 9
export const MINE_COUNT = 10

export type Dir = 'up' | 'down' | 'left' | 'right'

export function neighbors(i: number): number[] {
  const r = Math.floor(i / COLS)
  const c = i % COLS
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr
      const nc = c + dc
      if ((dr || dc) && nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push(nr * COLS + nc)
    }
  return out
}

export function countAt(mines: boolean[], i: number): number {
  return neighbors(i).filter((k) => mines[k]).length
}

export function newMines(): Mines {
  const cells = ROWS * COLS
  return {
    mines: null,
    revealed: Array(cells).fill(false),
    flagged: Array(cells).fill(false),
    cursor: Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2),
    state: 'playing',
    hit: null,
  }
}

// The first dig and its neighbors stay clear, so the opening always shows some board.
export function layMines(safe: number, rand: () => number): boolean[] {
  const clear = new Set([safe, ...neighbors(safe)])
  const open = [...Array(ROWS * COLS).keys()].filter((k) => !clear.has(k))
  const mines = Array(ROWS * COLS).fill(false)
  for (let n = 0; n < MINE_COUNT; n++) {
    const [k] = open.splice(Math.floor(rand() * open.length), 1)
    mines[k!] = true
  }
  return mines
}

export function moveCursor(g: Mines, dir: Dir): Mines {
  const r = Math.floor(g.cursor / COLS)
  const c = g.cursor % COLS
  const nr = Math.min(ROWS - 1, Math.max(0, r + (dir === 'down' ? 1 : dir === 'up' ? -1 : 0)))
  const nc = Math.min(COLS - 1, Math.max(0, c + (dir === 'right' ? 1 : dir === 'left' ? -1 : 0)))
  return { ...g, cursor: nr * COLS + nc }
}

export function flag(g: Mines): Mines {
  if (g.state !== 'playing' || g.revealed[g.cursor]) return g
  const flagged = [...g.flagged]
  flagged[g.cursor] = !flagged[g.cursor]
  return { ...g, flagged }
}

function reveal(mines: boolean[], revealed: boolean[], flagged: boolean[], start: number[]) {
  const queue = start.filter((k) => !revealed[k] && !flagged[k])
  while (queue.length) {
    const k = queue.pop()!
    if (revealed[k]) continue
    revealed[k] = true
    if (!mines[k] && countAt(mines, k) === 0)
      queue.push(...neighbors(k).filter((n) => !revealed[n] && !flagged[n]))
  }
}

// Digging a shown number whose flags all sit around it digs the rest of its neighbors.
export function dig(g: Mines, rand: () => number): Mines {
  if (g.state !== 'playing' || g.flagged[g.cursor]) return g
  const mines = g.mines ?? layMines(g.cursor, rand)
  let start = [g.cursor]
  if (g.revealed[g.cursor]) {
    const around = neighbors(g.cursor)
    if (around.filter((k) => g.flagged[k]).length !== countAt(mines, g.cursor)) return g
    start = around
  }
  const revealed = [...g.revealed]
  reveal(mines, revealed, g.flagged, start)
  const hit = start.find((k) => mines[k] && revealed[k]) ?? null
  if (hit !== null) return { ...g, mines, revealed, state: 'lost', hit }
  const won = revealed.every((shown, k) => shown || mines[k])
  return { ...g, mines, revealed, state: won ? 'won' : 'playing' }
}
