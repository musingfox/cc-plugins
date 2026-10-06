// Row-major, 4 * 4 cells, 0 for empty.
export type Board = number[]

export type Game = { board: Board; score: number; hasWon: boolean; isOver: boolean }

// Row-major cells; `mines` stays null until the first dig lays them around it.
export type Mines = {
  mines: boolean[] | null
  revealed: boolean[]
  flagged: boolean[]
  cursor: number
  state: 'playing' | 'won' | 'lost'
  hit: number | null
}

// One online Gomoku game as this client holds it; `seq` counts the moves made.
export type Gomoku = {
  code: string
  seat: 0 | 1
  seq: number
  board: string
  last: number | null
  names: [string | null, string | null]
  cursor: number
  isSynced: boolean
  isClosed: boolean
  note: string | null
}

declare module 'claude-code' {
  interface PluginState {
    games: { game2048: Game | null; best2048: number; mines: Mines | null; bestDino: number; gomoku: Gomoku | null }
  }
}
