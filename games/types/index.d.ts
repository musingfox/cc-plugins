// Row-major, 4 * 4 cells, 0 for empty.
export type Board = number[]

export type Game = { board: Board; score: number; hasWon: boolean; isOver: boolean }

declare module 'claude-code' {
  interface PluginState {
    games: { game2048: Game | null; best2048: number }
  }
}
