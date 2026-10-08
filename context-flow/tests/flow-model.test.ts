import { expect, test } from 'claude-code/testing'
import { implementFiguresOf } from '../hooks/cf-signals.ts'
import { reduceFlow } from '../hooks/flow-model.ts'

const ROOT = '/tmp/cf-1008-Rez6'
const ROOT2 = '/tmp/cf-1008-Ab12'
const EMPTY = { flow: null, lastEndedRoot: null }

function run(events: any[], from: any = EMPTY) {
  let tracker = from
  const ended: any[] = []
  for (const event of events) {
    const step = reduceFlow(tracker, event)
    tracker = step.tracker
    ended.push(step.ended)
  }
  return { tracker, ended }
}

test('FlowTimeline T1 repeat visits add to the same total and the six sum to the flow', () => {
  const { tracker, ended } = run([
    { kind: 'root', root: ROOT, at: 0 },
    { kind: 'phase', phase: 'research', at: 60000 },
    { kind: 'phase', phase: 'plan', at: 180000 },
    { kind: 'wait-start', id: 'q1', at: 300000 },
    { kind: 'wait-end', id: 'q1', at: 600000 },
    { kind: 'phase', phase: 'implement', at: 660000 },
    { kind: 'phase', phase: 'plan', at: 1260000 },
    { kind: 'phase', phase: 'implement', at: 1320000 },
    { kind: 'phase', phase: 'review', at: 1560000 },
    { kind: 'end', outcome: 'cleanup', at: 1680000 },
  ])
  expect(ended.at(-1)).toEqual({ root: ROOT, startedAt: 0, endedAt: 1680000, outcome: 'cleanup', phases: { setup: 60000, research: 120000, plan: 240000, implement: 840000, review: 120000, waiting: 300000 } })
  expect(tracker).toEqual({ flow: null, lastEndedRoot: ROOT })
})

test('FlowTimeline T2 overlapping waits count once', () => {
  const { ended } = run([
    { kind: 'root', root: ROOT, at: 0 },
    { kind: 'wait-start', id: 'q1', at: 10000 },
    { kind: 'wait-start', id: 'q2', at: 20000 },
    { kind: 'wait-end', id: 'q1', at: 30000 },
    { kind: 'wait-end', id: 'q2', at: 50000 },
    { kind: 'end', outcome: 'session-end', at: 60000 },
  ])
  expect(ended.at(-1).phases.waiting).toBe(40000)
  expect(ended.at(-1).phases.setup).toBe(20000)
  expect(ended.at(-1).outcome).toBe('session-end')
})

test('FlowTimeline T3 a different root closes the open flow as abandoned', () => {
  const { tracker, ended } = run([
    { kind: 'root', root: ROOT, at: 0 },
    { kind: 'root', root: ROOT2, at: 90000 },
  ])
  expect(ended[1]).toEqual({ root: ROOT, outcome: 'abandoned', startedAt: 0, endedAt: 90000, phases: { setup: 90000, research: 0, plan: 0, implement: 0, review: 0, waiting: 0 } })
  expect(tracker.flow).toMatchObject({ root: ROOT2, startedAt: 90000, phase: 'setup' })
  expect(tracker.lastEndedRoot).toBe(ROOT)
})

test('FlowTimeline T4 the last closed root does not reopen', () => {
  const from = { flow: null, lastEndedRoot: ROOT }
  const { tracker, ended } = run([{ kind: 'root', root: ROOT, at: 5000 }], from)
  expect(tracker).toEqual(from)
  expect(ended).toEqual([null])
})

test('FlowTimeline T5 events with no open flow change nothing', () => {
  const { tracker, ended } = run([
    { kind: 'phase', phase: 'plan', at: 0 },
    { kind: 'end', outcome: 'cleanup', at: 1 },
  ])
  expect(tracker).toEqual(EMPTY)
  expect(ended).toEqual([null, null])
})

test('FlowTimeline T6 a turn end clears every open wait', () => {
  const { ended } = run([
    { kind: 'root', root: ROOT, at: 0 },
    { kind: 'wait-start', id: 'q1', at: 1000 },
    { kind: 'turn-end', at: 4000 },
    { kind: 'end', outcome: 'cleanup', at: 10000 },
  ])
  expect(ended.at(-1).phases.waiting).toBe(3000)
  expect(ended.at(-1).phases.setup).toBe(7000)
})

test('FlowTimeline T7 the same root again changes nothing', () => {
  const first = run([{ kind: 'root', root: ROOT, at: 0 }])
  const second = run([{ kind: 'root', root: ROOT, at: 5000 }], first.tracker)
  expect(second.tracker).toEqual(first.tracker)
  expect(second.ended).toEqual([null])
})

test('FlowTimeline T8 a wait-end for an unopened id changes nothing', () => {
  const first = run([{ kind: 'root', root: ROOT, at: 0 }])
  const second = run([{ kind: 'wait-end', id: 'qX', at: 1000 }], first.tracker)
  expect(second.tracker).toEqual(first.tracker)
  expect(second.ended).toEqual([null])
})

const SHARDS = '{"fan_out_count":3,"groups":{"A":{},"B":{},"C":{}}}'
const PASS = '## Status\nPASS\n'
const FAIL = '## Status\nFAIL\n'

test('ImplementFigures T1 passed over total, round from outcome presence, retries left', () => {
  expect(implementFiguresOf({ shardsJson: SHARDS, outcomes: { A: PASS, B: FAIL, C: null }, dispatchStateJson: null, loopBudgetJson: '{"retries_used":1}' })).toEqual({ shards: { passed: 1, total: 3 }, round: 1, retriesLeft: 3 })
})

test('ImplementFigures T2 a running shard on top of a finished round is the next round', () => {
  const figures = implementFiguresOf({ shardsJson: SHARDS, outcomes: { A: PASS, B: null, C: PASS }, dispatchStateJson: '{"current_round":1}', loopBudgetJson: null })
  expect(figures.round).toBe(2)
  expect(figures.shards!.passed).toBe(2)
})

test('ImplementFigures T3 a finished round keeps its number', () => {
  const figures = implementFiguresOf({ shardsJson: SHARDS, outcomes: { A: PASS, B: PASS, C: PASS }, dispatchStateJson: '{"current_round":2}', loopBudgetJson: null })
  expect(figures.round).toBe(2)
  expect(figures.shards!.passed).toBe(3)
})

test('ImplementFigures T4 all outcomes present with no dispatch state is round 1', () => {
  expect(implementFiguresOf({ shardsJson: SHARDS, outcomes: { A: PASS, B: FAIL, C: PASS }, dispatchStateJson: null, loopBudgetJson: null }).round).toBe(1)
})

test('ImplementFigures T5 no shards.json leaves shards and round null', () => {
  expect(implementFiguresOf({ shardsJson: null, outcomes: {}, dispatchStateJson: null, loopBudgetJson: '{"retries_used":4}' })).toEqual({ shards: null, round: null, retriesLeft: 0 })
})

test('ImplementFigures T6 retries left floors at 0 and an unreadable budget is null', () => {
  expect(implementFiguresOf({ shardsJson: null, outcomes: {}, dispatchStateJson: null, loopBudgetJson: '{"retries_used":6}' }).retriesLeft).toBe(0)
  expect(implementFiguresOf({ shardsJson: null, outcomes: {}, dispatchStateJson: null, loopBudgetJson: 'not json' }).retriesLeft).toBeNull()
})

test('ImplementFigures T7 only a PASS right after the Status heading counts', () => {
  for (const outcome of ['## Status\nNEEDS_REPLAN\n', 'PASS\n## Status\nFAIL\n']) {
    expect(implementFiguresOf({ shardsJson: SHARDS, outcomes: { A: outcome, B: null, C: null }, dispatchStateJson: null, loopBudgetJson: null }).shards!.passed).toBe(0)
  }
})

test('ImplementFigures T8 total falls back to the number of groups', () => {
  expect(implementFiguresOf({ shardsJson: '{"groups":{"A":{},"B":{}}}', outcomes: {}, dispatchStateJson: null, loopBudgetJson: null }).shards!.total).toBe(2)
})
