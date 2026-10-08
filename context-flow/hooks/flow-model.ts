import type { EndedFlow, FlowBucket, FlowDetail, FlowEvent, FlowRecord, FlowState, FlowTracker } from '../types/index.d.ts'

const ZERO: Record<FlowBucket, number> = { setup: 0, research: 0, plan: 0, implement: 0, review: 0, waiting: 0 }

const open = (root: string, at: number): FlowState => ({ root, startedAt: at, phase: 'setup', since: at, waits: [], totals: { ...ZERO } })

// Adds the time since the last accrual to the bucket then current, never a negative amount.
function accrue(flow: FlowState, at: number): FlowState {
  const bucket: FlowBucket = flow.waits.length > 0 ? 'waiting' : flow.phase
  return { ...flow, since: Math.max(flow.since, at), totals: { ...flow.totals, [bucket]: flow.totals[bucket] + Math.max(0, at - flow.since) } }
}

const endedOf = (flow: FlowState, outcome: EndedFlow['outcome']): EndedFlow => ({ root: flow.root, startedAt: flow.startedAt, endedAt: flow.since, outcome, phases: { ...flow.totals } })

// An event that does not apply returns the same tracker object, so callers can tell a no-op by identity.
export function reduceFlow(tracker: FlowTracker, event: FlowEvent): { tracker: FlowTracker; ended: EndedFlow | null } {
  const same = { tracker, ended: null }
  const { flow } = tracker
  if (event.kind === 'root') {
    if (event.root === flow?.root || event.root === tracker.lastEndedRoot) return same
    if (!flow) return { tracker: { flow: open(event.root, event.at), lastEndedRoot: tracker.lastEndedRoot }, ended: null }
    return { tracker: { flow: open(event.root, event.at), lastEndedRoot: flow.root }, ended: endedOf(accrue(flow, event.at), 'abandoned') }
  }
  if (!flow) return same
  switch (event.kind) {
    case 'phase':
      return event.phase === flow.phase ? same : { tracker: { ...tracker, flow: { ...accrue(flow, event.at), phase: event.phase } }, ended: null }
    case 'wait-start': {
      if (flow.waits.includes(event.id)) return same
      const next = accrue(flow, event.at)
      return { tracker: { ...tracker, flow: { ...next, waits: [...next.waits, event.id] } }, ended: null }
    }
    case 'wait-end': {
      if (!flow.waits.includes(event.id)) return same
      const next = accrue(flow, event.at)
      return { tracker: { ...tracker, flow: { ...next, waits: next.waits.filter((id) => id !== event.id) } }, ended: null }
    }
    case 'turn-end':
      return flow.waits.length === 0 ? same : { tracker: { ...tracker, flow: { ...accrue(flow, event.at), waits: [] } }, ended: null }
    case 'end':
      return { tracker: { flow: null, lastEndedRoot: flow.root }, ended: endedOf(accrue(flow, event.at), event.outcome) }
  }
}

export const elapsedOf = (ms: number): string => {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export type BandLine = { head: string; isWaiting: boolean; elapsed: string }

// `head` is everything between the dot and the waiting mark: the name, the phase and the implement figures.
export function bandLineOf(tracker: FlowTracker, detail: FlowDetail | null, nowMs: number): BandLine | null {
  const { flow } = tracker
  if (!flow) return null
  const mine = detail?.root === flow.root ? detail : null
  const name = mine?.name ?? flow.root.slice(flow.root.lastIndexOf('/') + 1)
  const figures: string[] = []
  if (flow.phase === 'implement' && mine) {
    if (mine.shards) figures.push(`${mine.shards.passed}/${mine.shards.total} shards`)
    if (mine.round !== null) figures.push(`round ${mine.round}`)
    if (mine.retriesLeft !== null) figures.push(mine.retriesLeft === 1 ? '1 retry left' : `${mine.retriesLeft} retries left`)
  }
  return { head: ` cf ${name} · ${[flow.phase, ...figures].join(' · ')}`, isWaiting: flow.waits.length > 0, elapsed: elapsedOf(nowMs - flow.startedAt) }
}

export const appendFlowRecord = (existing: unknown, record: FlowRecord, max: number): FlowRecord[] =>
  (Array.isArray(existing) ? [...existing, record] : [record]).slice(-max)
