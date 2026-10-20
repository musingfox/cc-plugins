export type RunState = 'starting' | 'running' | 'question' | 'idle' | 'done' | 'blocked' | 'malformed' | 'exited'

export type LiveState = 'starting' | 'running' | 'question' | 'idle'

export type BandRow = {
  name: string
  state: LiveState
  title: string
  plan: { done: number; total: number } | null
  tools: number
  cost: number | null
  seconds: number
}

export type Board = { rows: BandRow[]; collect: number }

declare module 'claude-code' {
  interface PluginState {
    muster: { board: Board | null }
  }
}
