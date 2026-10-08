export type FlowPhase = 'setup' | 'research' | 'plan' | 'implement' | 'review'

export type FlowBucket = FlowPhase | 'waiting'

// `since` is the last moment time was accrued; `waits` holds the open AskUserQuestion ids.
export type FlowState = {
  root: string
  startedAt: number
  phase: FlowPhase
  since: number
  waits: string[]
  totals: Record<FlowBucket, number>
}

export type FlowTracker = { flow: FlowState | null; lastEndedRoot: string | null }

export type FlowOutcome = 'cleanup' | 'abandoned' | 'session-end'

export type FlowEvent =
  | { kind: 'root'; root: string; at: number }
  | { kind: 'phase'; phase: 'research' | 'plan' | 'implement' | 'review'; at: number }
  | { kind: 'wait-start'; id: string; at: number }
  | { kind: 'wait-end'; id: string; at: number }
  | { kind: 'turn-end'; at: number }
  | { kind: 'end'; outcome: 'cleanup' | 'session-end'; at: number }

export type EndedFlow = {
  root: string
  startedAt: number
  endedAt: number
  outcome: FlowOutcome
  phases: Record<FlowBucket, number>
}

export type FlowRecord = EndedFlow & { v: 1; slug: string | null }

export type ImplementFiguresResult = {
  shards: { passed: number; total: number } | null
  round: number | null
  retriesLeft: number | null
}

export type FlowDetail = ImplementFiguresResult & { root: string; name: string | null }

declare module 'claude-code' {
  interface PluginState {
    cf: { tracker: FlowTracker; detail: FlowDetail | null }
  }
}
