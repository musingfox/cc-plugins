import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'
import type { EndedFlow, FlowDetail, FlowEvent, FlowRecord, FlowTracker } from '../types/index.d.ts'
import { cleanupTargetOf, implementFiguresOf, isImplementCommand, phaseOfAgent, sessionRootOf, slugOf, sourcedRootOf } from './cf-signals.ts'
import { appendFlowRecord, bandLineOf, reduceFlow } from './flow-model.ts'

const POLL_MS = 10_000
const MAX_RECORDS = 100

const tracker = atom({ plugin: 'cf', key: 'tracker' } as const, { flow: null, lastEndedRoot: null } as FlowTracker)
const detail = atom({ plugin: 'cf', key: 'detail' } as const, null as FlowDetail | null)

let timer: { cancel(): void } | null = null

// An event that needs the tracker to decide (cleanup of "whichever root is open") is a function of it.
type Step = FlowEvent | ((tracker: FlowTracker) => FlowEvent | null)

// What Claude's Bash result says: the tool's stdout, or the text the model reads when stdout is not a string.
function outputOf(result: any): string {
  const stdout = result?.result?.stdout
  if (typeof stdout === 'string') return stdout
  return typeof result?.text === 'string' ? result.text : ''
}

const readText = ($: any, path: string): Promise<string | null> => Promise.resolve($.fs.read(path)).then((text: unknown) => (typeof text === 'string' ? text : null), () => null)

// One update runs every step; the update may retry, so `ended` and `opened` are those of the attempt that committed.
async function applyEvents($: any, steps: Step[]): Promise<{ ended: EndedFlow[]; opened: boolean }> {
  let ended: EndedFlow[] = []
  let opened = false
  await update($, tracker, (before: FlowTracker) => {
    ended = []
    let current = before
    for (const step of steps) {
      const event = typeof step === 'function' ? step(current) : step
      if (!event) continue
      const reduced = reduceFlow(current, event)
      current = reduced.tracker
      if (reduced.ended) ended.push(reduced.ended)
    }
    opened = current.flow !== null && current.flow.root !== before.flow?.root
    return current
  })
  return { ended, opened }
}

async function recordFlow($: any, ended: EndedFlow) {
  try {
    const record: FlowRecord = { v: 1, root: ended.root, slug: slugOf(await readText($, `${ended.root}/env.sh`)), startedAt: ended.startedAt, endedAt: ended.endedAt, outcome: ended.outcome, phases: ended.phases }
    await $.store.set('flows', appendFlowRecord(await $.store.get('flows'), record, MAX_RECORDS))
  } catch {
    // A refused store loses the record, never the band.
  }
}

async function recordAll($: any, ended: EndedFlow[]) {
  for (const flow of ended) await recordFlow($, flow)
}

// Reads env.sh, and while the phase is implement cf's shard files; never invalidates: the detail write redraws.
async function poll($: any) {
  const { flow } = await read($, tracker)
  if (!flow) return
  const { root } = flow
  const name = slugOf(await readText($, `${root}/env.sh`))
  let figures: Pick<FlowDetail, 'shards' | 'round' | 'retriesLeft'> = { shards: null, round: null, retriesLeft: null }
  if (flow.phase === 'implement') {
    const shardsJson = await readText($, `${root}/shards.json`)
    let ids: string[] = []
    try {
      ids = Object.keys(JSON.parse(shardsJson ?? 'null')?.groups ?? {})
    } catch {
      // implementFiguresOf reports the unreadable file as no shards.
    }
    // fromEntries defines own keys, so a group id like __proto__ is an entry, not a prototype write.
    const outcomes = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await readText($, `${root}/shards/${id}/outcome.md`)] as const)))
    figures = implementFiguresOf({ shardsJson, outcomes, dispatchStateJson: await readText($, `${root}/dispatch-state.json`), loopBudgetJson: await readText($, `${root}/loop-budget.json`) })
  }
  // A poll that outlived its flow must not overwrite the new flow's detail.
  if ((await read($, tracker)).flow?.root !== root) return
  await update($, detail, () => ({ root, name, ...figures }))
}

// The bookkeeping after a state change: closed flows go to the store, a newly opened root is polled once.
function settle($: any, { ended, opened }: { ended: EndedFlow[]; opened: boolean }) {
  if (ended.length) void recordAll($, ended).catch(() => {})
  if (opened) void poll($).catch(() => {})
}

async function drawBand($: any, e: any, beneath: unknown) {
  const { Box, Text } = await $.ui.resolve(e)
  const line = bandLineOf(await read($, tracker), await read($, detail), await $.clock.now())
  if (!line) return beneath
  const warning = Text({ color: 'warning', children: ['waiting for you'] })
  return Box({
    flexDirection: 'column',
    children: [
      Text({
        wrap: 'truncate-end',
        children: [Text({ color: line.isWaiting ? 'warning' : 'suggestion', children: ['●'] }), line.head, ...(line.isWaiting ? [' · ', warning] : []), ` · ${line.elapsed}`],
      }),
      beneath,
    ],
  })
}

async function onTick($: any) {
  if (!(await read($, tracker)).flow) return
  void poll($).catch(() => {})
  $.ui.invalidate('ui.render')
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    // A reload re-fires session.start on this instance; a second timer would double the cadence.
    timer?.cancel()
    timer = $.clock.every(POLL_MS, () => {
      void onTick($).catch(() => {})
    })
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    try {
      const command = String(e.command ?? '')
      const root = sourcedRootOf(command)
      const target = cleanupTargetOf(command)
      const implement = isImplementCommand(command)
      if (root || target || implement) {
        const at = await $.clock.now()
        const steps: Step[] = []
        if (root) steps.push({ kind: 'root', root, at })
        if (implement) steps.push({ kind: 'phase', phase: 'implement', at })
        if (target) steps.push((t) => (t.flow && (target === 'any' || target === t.flow.root) ? { kind: 'end', outcome: 'cleanup', at } : null))
        settle($, await applyEvents($, steps))
      }
    } catch {
      // The command still runs when the band cannot follow it.
    }
    const result = await next(e)
    void (async () => {
      const root = sessionRootOf(outputOf(result))
      if (root) settle($, await applyEvents($, [{ kind: 'root', root, at: await $.clock.now() }]))
    })().catch(() => {})
    return result
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const phase = e.agentId === undefined ? phaseOfAgent(e.subagent_type) : null
    if (phase) {
      try {
        await applyEvents($, [{ kind: 'phase', phase, at: await $.clock.now() }])
      } catch {
        // The agent still runs.
      }
    }
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    let id = ''
    try {
      const at = await $.clock.now()
      id = e.tool_use_id ?? `ask@${at}`
      await applyEvents($, [{ kind: 'wait-start', id, at }])
    } catch {
      // The dialog opens without its mark.
    }
    try {
      return await next(e)
    } finally {
      try {
        await applyEvents($, [{ kind: 'wait-end', id, at: await $.clock.now() }])
      } catch {
        // A mark left open is cleared by the turn's end.
      }
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        if ((await read($, tracker)).flow?.waits.length) await applyEvents($, [{ kind: 'turn-end', at: await $.clock.now() }])
      } catch {
        // The turn still completes.
      }
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try {
      const { ended } = await applyEvents($, [{ kind: 'end', outcome: 'session-end', at: await $.clock.now() }])
      await recordAll($, ended)
    } catch {
      // The session still ends.
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props?.hasSurvey) return next(e)
    try {
      if (!(await read($, tracker)).flow) return next(e)
    } catch {
      return next(e)
    }
    const beneath = await next(e)
    try {
      return await drawBand($, e, beneath)
    } catch {
      return beneath
    }
  })
}
