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

export type RunDetail = {
  name: string
  report: string | null
  reason: string | null
  questions: { n: number; paths: string[] }[]
  activity: Activity | null
}

export type PlanEntry = { status: 'completed' | 'in_progress' | 'pending'; content: string }

export type Activity = { plan: { done: number; total: number; shown: PlanEntry[] } | null; said: string[]; denied: string[] }

export type TreeView = { folded: string[]; selected: string | null; at: string | null; detail: RunDetail | null }

declare module 'claude-code' {
  interface PluginState {
    muster: { board: Board | null; tree: TreeGroup[] | null; view: TreeView }
  }
}
