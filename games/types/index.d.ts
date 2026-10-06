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

declare module 'claude-code' {
  interface PluginState {
    games: { game2048: Game | null; best2048: number; mines: Mines | null }
  }
}
