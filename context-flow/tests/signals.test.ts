import { expect, test } from 'claude-code/testing'
import { BAND, bandLines, nodesOf, stringsIn } from './fixtures/band.ts'
import { BENEATH, ENV, ENV2, ROOT, ROOT2, SESSION, SETUP_OUT, bareBash, ok, openFlow, world } from './fixtures/world.ts'
import { isImplementCommand, sourcedRootOf } from '../hooks/cf-signals.ts'

const first = async ($: any) => (await bandLines($))[0]
const colorOf = (node: any) => node.props?.color ?? node.color
const ENV_FILES = { [`${ROOT}/env.sh`]: ENV }
const ASYNC = { result: { status: 'async_launched', agentId: 'a1', description: 'd', prompt: 'p', outputFile: '/o' } }

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

test('ImplementOnlyWhenExecuted T2 a sourced env then a quoted script path executes', () => {
  expect(isImplementCommand('. "$SESSION/env.sh"\n"$SCRIPTS/cf-pi-worktree.sh" "$SESSION" >/dev/null')).toBe(true)
})

test('ImplementOnlyWhenExecuted T3 a loop body line executes', () => {
  expect(isImplementCommand('for id in A B; do\n  "$SCRIPTS/cf-pi-run.sh" --prepare-only "$SESSION/shards/$id" \'g\' \'c\' "$SHARD_TEST_RUNNER" > x 2>&1\ndone')).toBe(true)
})

test('ImplementOnlyWhenExecuted T4 do on one line executes', () => {
  expect(isImplementCommand('for id in J P; do "$SC/cf-pi-run.sh" --prepare-only x; done')).toBe(true)
})

test('ImplementOnlyWhenExecuted T5 leading assignments execute', () => {
  expect(isImplementCommand('PI_PROVIDER=x PI_MODEL=y BASH_MAX_TIMEOUT_MS=5400000 /Users/n/scripts/cf-pi-run.sh /tmp/cf-1008-Rez6/shards/A g c t')).toBe(true)
})

test('ImplementOnlyWhenExecuted T6 a chain after && executes', () => {
  expect(isImplementCommand('. /tmp/cf-1008-Rez6/env.sh && echo "A returned $(date +%s)" >> x.log && $SCRIPTS/cf-pi-run.sh --gates-only /tmp/cf-1008-Rez6/shards/A \'g\' \'c\' "$SHARD_TEST_RUNNER" > g.out 2>&1')).toBe(true)
})

test('ImplementOnlyWhenExecuted T7 a braced variable prefix executes', () => {
  expect(isImplementCommand('"${SCRIPTS}/cf-pi-shard.sh" "$S"')).toBe(true)
})

test('ImplementOnlyWhenExecuted T8 bash runner executes', () => {
  expect(isImplementCommand('bash "$SCRIPTS/cf-pi-run.sh" x')).toBe(true)
})

test('ImplementOnlyWhenExecuted T9 a bare name executes', () => {
  expect(isImplementCommand('cf-pi-shard.sh /tmp/cf-1008-Rez6')).toBe(true)
})

test('ImplementOnlyWhenExecuted T10 then executes', () => {
  expect(isImplementCommand('if true; then "$SCRIPTS/cf-pi-shard.sh" "$SESSION"; fi')).toBe(true)
})

test('ImplementOnlyWhenExecuted T11 a .bak name is not the script', () => {
  expect(isImplementCommand('cat cf-pi-run.sh.bak')).toBe(false)
})

test('ImplementOnlyWhenExecuted T12 grep does not execute', () => {
  expect(isImplementCommand('grep -n cf-pi-run.sh scripts/')).toBe(false)
})

test('ImplementOnlyWhenExecuted T13 sed does not execute', () => {
  expect(isImplementCommand('sed -n 1,20p "$SCRIPTS/cf-pi-run.sh"')).toBe(false)
})

test('ImplementOnlyWhenExecuted T14 bash -n does not execute', () => {
  expect(isImplementCommand('bash -n scripts/cf-pi-run.sh')).toBe(false)
})

test('ImplementOnlyWhenExecuted T15 cat of a braced path does not execute', () => {
  expect(isImplementCommand('cat "${SCRIPTS}/cf-pi-run.sh"')).toBe(false)
})

test('ImplementOnlyWhenExecuted T16 another cf script is not implement', () => {
  expect(isImplementCommand('bash "$SCRIPTS/cf-pi-status.sh" /tmp/cf-1008-Rez6')).toBe(false)
})

test('ImplementOnlyWhenExecuted T17 git add does not execute', () => {
  expect(isImplementCommand('git add context-flow/scripts/cf-pi-shard.sh')).toBe(false)
})

test('ImplementOnlyWhenExecuted T1 grepping a runner name leaves the phase', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, 'grep -n cf-pi-run.sh context-flow/scripts/')
  expect(await first($)).toContain('· setup ·')
})

const SETUP = 'SESSION=$("$SCRIPTS/cf-pi-setup.sh" "mod-band")\necho "$SESSION"'

test('SetupRunOpensFlow T1 a bare root on stdout opens the band', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, SETUP)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('SetupRunOpensFlow T2 a SESSION= line followed by other words opens the band', async ($, on) => {
  const w = await bareBash($, on, ok('SESSION=/tmp/cf-1008-Rez6 PI_AVAILABLE=1 PI_DESC=pi\n'))
  await bash($, w, SETUP)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('SetupRunOpensFlow T3 a SESSION= line after other output opens the band', async ($, on) => {
  const w = await bareBash($, on, ok('## main...origin/main\nSESSION=/tmp/cf-1008-Rez6 CF_IMPLEMENTER=claude\n'))
  await bash($, w, SETUP)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('SetupRunOpensFlow T4 a /private/tmp root opens the band', async ($, on) => {
  const w = await bareBash($, on, ok('/private/tmp/cf-1008-Rez6\n'))
  await bash($, w, SETUP)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('SetupRunOpensFlow T5 the text opens the band when stdout is not a string', async ($, on) => {
  const w = await bareBash($, on, { result: {}, text: '/tmp/cf-1008-Rez6' })
  await bash($, w, SETUP)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('SetupRunOpensFlow T6 setup under an env prefix opens the band', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, 'SESSION=$(CF_IMPLEMENTER=omp PI_DISPATCH_CMD=\'pi --model x\' "$SCRIPTS/cf-pi-setup.sh" "mod-band")\necho "$SESSION"')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('SetupRunOpensFlow T7 a direct setup run opens the band', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, '"$SCRIPTS/cf-pi-setup.sh" mod-band')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('SetupRunOpensFlow T8 the SESSION line wins over an earlier root', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-0101-Zz99\nSESSION=/tmp/cf-1008-Rez6\n'))
  await bash($, w, SETUP)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
  expect(w.storeCalls).toEqual([])
})

test('SetupRunOpensFlow T9 a root with a longer tail opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6xyz\n'))
  await bash($, w, SETUP)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('SetupRunOpensFlow T10 empty output opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, SETUP)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('SetupRunOpensFlow T11 grepping the setup name opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, 'grep -rn "cf-pi-setup.sh" tests/')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('SetupRunOpensFlow T12 echoing a braced setup path opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, 'echo "${SCRIPTS}/cf-pi-setup.sh"')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('SetupRunOpensFlow T13 bash -n of the setup opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, 'bash -n "$SCRIPTS/cf-pi-setup.sh"')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('SetupRunOpensFlow T14 a non-setup command opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, 'cf setup')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('SourcedRootOnlyWhenExecuted T1 ls with a dot argument opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, 'ls -la . /tmp/cf-1008-Rez6/env.sh')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('SourcedRootOnlyWhenExecuted T2 echoing source yields no root', () => {
  expect(sourcedRootOf('echo source /tmp/cf-1008-Rez6/env.sh')).toBeNull()
})

test('SourcedRootOnlyWhenExecuted T3 the last executed source wins', () => {
  expect(sourcedRootOf('. /tmp/cf-1008-Rez6/env.sh && . "/tmp/cf-1008-Ab12/env.sh"')).toBe('/tmp/cf-1008-Ab12')
})

test('SourcedRootOnlyWhenExecuted T4 a loop body source counts', () => {
  expect(sourcedRootOf('for f in 1; do . "/tmp/cf-1008-Rez6/env.sh"; done')).toBe('/tmp/cf-1008-Rez6')
})

test('ImplementOnlyWhenExecuted R1 a runner followed by a flag-led path executes nothing', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, 'bash -x/cf-pi-run.sh')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
  expect(isImplementCommand('bash -x/cf-pi-run.sh')).toBe(false)
  expect(isImplementCommand('sh -n/x/cf-pi-shard.sh')).toBe(false)
})

test('SetupRunOpensFlow R1 a flag-led setup path opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, 'bash -x/cf-pi-setup.sh')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})
