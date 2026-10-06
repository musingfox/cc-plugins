import type { Board, Game } from '../types'

export const SIZE = 4
export const GOAL = 2048

export type Dir = 'up' | 'down' | 'left' | 'right'

export type Slid = { board: Board; gained: number; moved: boolean }

function lineIndexes(dir: Dir, i: number): number[] {
  const steps = [...Array(SIZE).keys()]
  if (dir === 'left') return steps.map((c) => i * SIZE + c)
  if (dir === 'right') return steps.map((c) => i * SIZE + (SIZE - 1 - c))
  if (dir === 'up') return steps.map((r) => r * SIZE + i)
  return steps.map((r) => (SIZE - 1 - r) * SIZE + i)
}

// Each tile merges at most once per move, so [2, 2, 4] becomes [4, 4], not [8].
function slideLine(line: number[]): { line: number[]; gained: number } {
  const tiles = line.filter((v) => v !== 0)
  const out: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tiles[i + 1]) {
      const merged = tiles[i]! * 2
      out.push(merged)
      gained += merged
      i++
    } else out.push(tiles[i]!)
  }
  while (out.length < SIZE) out.push(0)
  return { line: out, gained }
}

export function slide(board: Board, dir: Dir): Slid {
  const next = [...board]
  let gained = 0
  for (let i = 0; i < SIZE; i++) {
    const idx = lineIndexes(dir, i)
    const slid = slideLine(idx.map((k) => board[k]!))
    idx.forEach((k, j) => (next[k] = slid.line[j]!))
    gained += slid.gained
  }
  return { board: next, gained, moved: next.some((v, k) => v !== board[k]) }
}

// rand returns [0, 1), as Math.random does.
export function spawn(board: Board, rand: () => number): Board {
  const empty = board.flatMap((v, k) => (v === 0 ? [k] : []))
  if (empty.length === 0) return board
  const next = [...board]
  next[empty[Math.floor(rand() * empty.length)]!] = rand() < 0.9 ? 2 : 4
  return next
}

export function canMove(board: Board): boolean {
  return (['up', 'down', 'left', 'right'] as const).some((dir) => slide(board, dir).moved)
}

export function newGame(rand: () => number): Game {
  const board = spawn(spawn(Array(SIZE * SIZE).fill(0), rand), rand)
  return { board, score: 0, hasWon: false, isOver: false }
}

export function move(game: Game, dir: Dir, rand: () => number): Game {
  if (game.isOver) return game
  const slid = slide(game.board, dir)
  if (!slid.moved) return game
  const board = spawn(slid.board, rand)
  return {
    board,
    score: game.score + slid.gained,
    hasWon: game.hasWon || board.some((v) => v >= GOAL),
    isOver: !canMove(board),
  }
}
