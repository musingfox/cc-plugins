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

export type RunRow = {
  name: string
  state: RunState
  title: string
  plan: { done: number; total: number } | null
  tools: number
  cost: number | null
  seconds: number
  issue: string | null
  exitReason: string | null
}

export type TreeGroup = { issue: string | null; runs: RunRow[] }

declare module 'claude-code' {
  interface PluginState {
    muster: { board: Board | null; tree: TreeGroup[] | null }
  }
}
