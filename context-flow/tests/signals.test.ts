import { expect, test } from 'claude-code/testing'
import { BAND, bandLines, nodesOf, stringsIn } from './fixtures/band.ts'
import { BENEATH, ENV, ENV2, ROOT, ROOT2, SESSION, SETUP_OUT, ok, openFlow, world } from './fixtures/world.ts'

const first = async ($: any) => (await bandLines($))[0]
const colorOf = (node: any) => node.props?.color ?? node.color
const ASYNC = { result: { status: 'async_launched', agentId: 'a1', description: 'd', prompt: 'p', outputFile: '/o' } }
const ENV_FILES = { [`${ROOT}/env.sh`]: ENV }

// A world with nothing open yet: the Bash tool answers `answer`.
async function bareBash($: any, on: any, answer: unknown, options: any = {}) {
  const w = world(on, { beneath: BENEATH, files: ENV_FILES, ...options })
  on('tool.call', { tool: 'Bash' }, () => answer)
  await $.session.start(SESSION)
  await w.clock.settle()
  return w
}

const bash = async ($: any, w: any, command: string, extra: object = {}) => {
  const result = await $.tool.call({ tool: 'Bash', command, ...extra })
  await w.clock.settle()
  return result
}

test('FlowStartsOnSetupLine T1 the setup line opens a band', async ($, on) => {
  const w = await bareBash($, on, ok(SETUP_OUT))
  await bash($, w, 'cf setup')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('FlowStartsOnSetupLine T2 a quoted value opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok(`SESSION="${ROOT}"\n`))
  await bash($, w, 'cf setup')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('FlowStartsOnSetupLine T3 a shard path opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok(`SESSION=${ROOT}/shards/A\n`))
  await bash($, w, 'cf setup')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('FlowStartsOnSetupLine T4 a subagent Bash opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok(SETUP_OUT))
  await bash($, w, 'cf setup', { agentId: 'sub-1' })
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('FlowStartsOnSetupLine T5 the text opens a band when stdout is not a string', async ($, on) => {
  const w = await bareBash($, on, { result: {}, text: `SESSION=${ROOT}` })
  await bash($, w, 'cf setup')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('FlowFollowsSourcedRoot T1 sourcing a quoted env.sh opens the band', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, `. "${ROOT}/env.sh"\nhead -30 "${ROOT}/research.md"`)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('FlowFollowsSourcedRoot T2 an unquoted dot-source opens the band', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, `. ${ROOT}/env.sh && "$SCRIPTS/cf-pi-status.sh" ${ROOT}`)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('FlowFollowsSourcedRoot T3 source opens the band', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, `source "${ROOT}/env.sh"`)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('FlowFollowsSourcedRoot T4 a shard env.sh opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, `. "${ROOT}/shards/A/env.sh"`)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('FlowFollowsSourcedRoot T5 a plain mention of a root opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, `cat ${ROOT}/plan.md`)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('FlowFollowsSourcedRoot T6 the latest sourced root wins', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { files: { ...ENV_FILES, [`${ROOT2}/env.sh`]: ENV2 } })
  answer.answer = ok('')
  await bash($, w, `. "${ROOT2}/env.sh" && ls`)
  expect(await first($)).toBe('● cf other-flow · setup · 0m')
})

const BACKGROUND = { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: 'Command running in background with ID: b1' }
const RUN = `. ${ROOT}/env.sh && /p/scripts/cf-pi-run.sh ${ROOT}/shards/A 'g' 'c' "bun test"`

test('ImplementFollowsShardScript T1 a background shard runner moves the band to implement', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = BACKGROUND
  await bash($, w, RUN)
  expect(await first($)).toContain('· implement ·')
})

test('ImplementFollowsShardScript T2 cf-pi-shard.sh moves the band to implement', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, `"$SCRIPTS/cf-pi-shard.sh" "${ROOT}"`)
  expect(await first($)).toContain('· implement ·')
})

test('ImplementFollowsShardScript T3 cf-pi-worktree.sh moves the band to implement', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, `"$SCRIPTS/cf-pi-worktree.sh" "${ROOT}" >/dev/null`)
  expect(await first($)).toContain('· implement ·')
})

test('ImplementFollowsShardScript T4 other cf scripts leave the phase', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, `bash "$SCRIPTS/cf-pi-status.sh" ${ROOT}`)
  expect(await first($)).toContain('· setup ·')
})

test('ImplementFollowsShardScript T5 a subagent runner leaves the phase', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = BACKGROUND
  await bash($, w, RUN, { agentId: 'sub-1' })
  expect(await first($)).toContain('· setup ·')
})

test('PhaseFollowsCfAgent T1 a foreground agent shows its phase while it runs', async ($, on) => {
  on('tool.call', { tool: 'Agent' }, async () => {
    await clock.sleep(120_000)
    return ASYNC
  })
  const { w } = await openFlow($, on)
  clock = w.clock
  const pending = $.tool.call({ tool: 'Agent', subagent_type: 'cf:research', prompt: 'p', description: 'd' })
  await w.clock.settle()
  expect(await first($)).toBe('● cf mod-band · research · 0m')
  await w.clock.advance(120_000)
  await pending
})
let clock: any

test('PhaseFollowsCfAgent T2 a background agent shows its phase', async ($, on) => {
  on('tool.call', { tool: 'Agent' }, () => ASYNC)
  const { w } = await openFlow($, on)
  await $.tool.call({ tool: 'Agent', subagent_type: 'cf:review', prompt: 'p', description: 'd' })
  await w.clock.settle()
  expect(await first($)).toContain('· review ·')
})

test('PhaseFollowsCfAgent T3 another agent type leaves the phase', async ($, on) => {
  on('tool.call', { tool: 'Agent' }, () => ASYNC)
  const { w } = await openFlow($, on)
  await $.tool.call({ tool: 'Agent', subagent_type: 'general-purpose', prompt: 'p', description: 'd' })
  await w.clock.settle()
  expect(await first($)).toContain('· setup ·')
})

test('PhaseFollowsCfAgent T4 a subagent dispatch leaves the phase', async ($, on) => {
  on('tool.call', { tool: 'Agent' }, () => ASYNC)
  const { w } = await openFlow($, on)
  await $.tool.call({ tool: 'Agent', subagent_type: 'cf:plan', prompt: 'p', description: 'd', agentId: 'sub-1' })
  await w.clock.settle()
  expect(await first($)).toContain('· setup ·')
})

test('PhaseFollowsCfAgent T5 no flow, no band', async ($, on) => {
  on('tool.call', { tool: 'Agent' }, () => ASYNC)
  const w = world(on, { beneath: BENEATH })
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Agent', subagent_type: 'cf:plan', prompt: 'p', description: 'd' })
  await w.clock.settle()
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

const ANSWER = { result: { answers: { 'Proceed?': 'Approve' } }, text: 'Approve' }
const ask = ($: any, extra: object = {}) => $.tool.call({ tool: 'AskUserQuestion', questions: [], ...extra })

test('WaitingMark T1 an open question marks the band in the warning colour', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    await waitClock.sleep(60_000)
    return ANSWER
  })
  const { w } = await openFlow($, on)
  waitClock = w.clock
  const pending = ask($)
  await w.clock.settle()
  expect(await first($)).toBe('● cf mod-band · setup · waiting for you · 0m')
  const tree = await $.ui.render(BAND)
  const texts = nodesOf(tree, 'Text')
  expect(colorOf(texts.find((node) => stringsIn(node).join('') === '●'))).toBe('warning')
  expect(colorOf(texts.find((node) => stringsIn(node).join('') === 'waiting for you'))).toBe('warning')
  await w.clock.advance(60_000)
  await pending
})
let waitClock: any

test('WaitingMark T2 the mark clears once the question is answered', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    await waitClock.sleep(60_000)
    return ANSWER
  })
  const { w } = await openFlow($, on)
  waitClock = w.clock
  const pending = ask($)
  await w.clock.settle()
  await w.clock.advance(60_000)
  await pending
  await w.clock.settle()
  expect(await first($)).toBe('● cf mod-band · setup · 1m')
  const dot = nodesOf(await $.ui.render(BAND), 'Text').find((node) => stringsIn(node).join('') === '●')
  expect(colorOf(dot)).toBe('suggestion')
})

test('WaitingMark T3 no flow, no band', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, () => new Promise(() => {}))
  const w = world(on, { beneath: BENEATH })
  await $.session.start(SESSION)
  void ask($)
  await w.clock.settle()
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('WaitingMark T4 a subagent question leaves the band alone', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, () => new Promise(() => {}))
  const { w } = await openFlow($, on)
  void ask($, { agentId: 'sub-1' })
  await w.clock.settle()
  expect(await first($)).not.toContain('waiting for you')
})

const TURN = { answer: '', durationMs: 1, isAborted: true, turnId: 't1', reason: 'aborted' }

test('WaitClearsOnInterrupt T1 a question whose call fails stops marking the band', async ($, on) => {
  const { w } = await openFlow($, on)
  await expect(ask($)).rejects.toThrow()
  await w.clock.settle()
  expect(await first($)).not.toContain('waiting for you')
})

test('WaitClearsOnInterrupt T2 a main-loop turn end clears an unsettled question', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, () => new Promise(() => {}))
  const { w } = await openFlow($, on)
  void ask($)
  await w.clock.settle()
  expect(await first($)).toContain('waiting for you')
  await $.turn.complete(TURN)
  await w.clock.settle()
  expect(await first($)).not.toContain('waiting for you')
})

test('WaitClearsOnInterrupt T3 a subagent turn end clears nothing', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, () => new Promise(() => {}))
  const { w } = await openFlow($, on)
  void ask($)
  await w.clock.settle()
  await $.turn.complete({ ...TURN, agentId: 'sub-1' })
  await w.clock.settle()
  expect(await first($)).toContain('waiting for you')
})

test('WaitClearsOnInterrupt T4 the turn result passes through', async ($, on) => {
  world(on)
  expect(await $.turn.complete(TURN)).toEqual({ text: '' })
})

test('ToolResultsPassThrough T1 the setup output reaches Claude as it was', async ($, on) => {
  const w = await bareBash($, on, ok(SETUP_OUT))
  expect(await bash($, w, 'cf setup')).toEqual(ok(SETUP_OUT))
})

test('ToolResultsPassThrough T2 the agent result reaches Claude as it was', async ($, on) => {
  on('tool.call', { tool: 'Agent' }, () => ASYNC)
  const { w } = await openFlow($, on)
  const result = await $.tool.call({ tool: 'Agent', subagent_type: 'cf:research', prompt: 'p', description: 'd' })
  await w.clock.settle()
  expect(result).toEqual(ASYNC)
})

test('ToolResultsPassThrough T3 the human answer reaches Claude as it was', async ($, on) => {
  on('tool.call', { tool: 'AskUserQuestion' }, () => ANSWER)
  await openFlow($, on)
  expect(await ask($)).toEqual(ANSWER)
})

test('ToolResultsPassThrough T4 failing bookkeeping never replaces the result', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { store: 'refuse' })
  w.files[`${ROOT}/env.sh`] = { deny: 'EACCES' }
  answer.answer = ok('')
  expect(await bash($, w, `bash ${ROOT}/cleanup.sh`)).toEqual(ok(''))
})

test('IdleCostsNothing T1 an unrelated Bash touches no file or store', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('total 0\n')
  await w.clock.settle()
  const counts = [w.readCalls.length, w.storeCalls.length]
  await bash($, w, 'ls -la')
  expect([w.readCalls.length, w.storeCalls.length]).toEqual(counts)
})

test('IdleCostsNothing T2 ticks with no flow touch no file or store', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  await w.clock.advance(60_000)
  expect([w.readCalls.length, w.storeCalls.length]).toEqual([0, 0])
})
