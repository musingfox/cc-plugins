import { expect, test } from 'claude-code/testing'
import { BAND, bandLines, nodesOf, stringsIn } from './fixtures/band.ts'
import { BENEATH, ENV, ENV2, ROOT, ROOT2, SESSION, SETUP_OUT, bareBash, ok, openFlow, world } from './fixtures/world.ts'
import { ASYNC, bash, colorOf, first } from './fixtures/helpers.ts'
import { cleanupTargetOf, isImplementCommand, isSetupCommand, setupRootOf, sourcedRootOf } from '../hooks/cf-signals.ts'

const ENV_FILES = { [`${ROOT}/env.sh`]: ENV }

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

test('ImplementOnlyWhenExecuted R2 a runner followed by a quoted flag-led path executes nothing', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, 'bash "-x/cf-pi-run.sh"')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
  expect(isImplementCommand('bash "-x/cf-pi-run.sh"')).toBe(false)
  expect(isImplementCommand("bash '-x/cf-pi-run.sh'")).toBe(false)
})

test('SetupRunOpensFlow R2 a quoted flag-led setup path opens nothing', async ($, on) => {
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, 'bash "-x/cf-pi-setup.sh"')
  await bash($, w, "bash '-x/cf-pi-setup.sh'")
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('ImplementOnlyWhenExecuted R3 an assignment value cannot hide a mention or backtrack', () => {
  expect(isImplementCommand('OUT=$(bash -x/cf-pi-run.sh)')).toBe(false)
  expect(isImplementCommand('X=$(cat "$SCRIPTS/cf-pi-run.sh")')).toBe(false)
  expect(isImplementCommand('X="a cf-pi-run.sh" make')).toBe(false)
  expect(isImplementCommand('X=$(date) cf-pi-run.sh')).toBe(true)
  const t = Date.now()
  expect(isImplementCommand("A='' ".repeat(200) + 'make')).toBe(false)
  expect(Date.now() - t).toBeLessThan(50)
})

test('SetupRunOpensFlow R3 a substitution that only names the setup script opens nothing', async ($, on) => {
  expect(isSetupCommand('B=$(basename "$SCRIPTS/cf-pi-setup.sh")')).toBe(false)
  expect(isSetupCommand("SESSION=$(CF_IMPLEMENTER=omp PI_DISPATCH_CMD='pi --model x' \"$SCRIPTS/cf-pi-setup.sh\" s)")).toBe(true)
  const w = await bareBash($, on, ok('/tmp/cf-1008-Rez6\n'))
  await bash($, w, 'B=$(basename "$SCRIPTS/cf-pi-setup.sh")')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('SetupRootOf T1 a root that runs on into more name opens nothing', () => {
  expect(setupRootOf('/tmp/cf-1008-Rez6x\n')).toBe(null)
})

test('SetupRootOf T2 the first root that ends its name is the one returned', () => {
  expect(setupRootOf('/tmp/cf-1008-Rez6\nSESSION=/tmp/cf-1008-Rez6\n')).toBe('/tmp/cf-1008-Rez6')
})

test('SharedHelpers T1 bash forwards extra to the tool call', async ($, on) => {
  const w = await bareBash($, on, ok(SETUP_OUT))
  await bash($, w, 'cf setup', { agentId: 'sub-1' })
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
  await bash($, w, 'cf setup')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
})

test('SharedHelpers T2 colorOf prefers props.color over a bare color', () => {
  expect(colorOf({ props: { color: 'warning' }, color: 'x' })).toBe('warning')
  expect(colorOf({ color: 'suggestion' })).toBe('suggestion')
})

test('SharedHelpers T3 ASYNC is the Agent result the helper returns unchanged', async ($, on) => {
  on('tool.call', { tool: 'Agent' }, () => ASYNC)
  expect(ASYNC.result.status).toBe('async_launched')
  const result = await $.tool.call({ tool: 'Agent', subagent_type: 'general-purpose', prompt: 'p', description: 'd' })
  expect(result).toEqual(ASYNC)
})

test('SharedHelpers T4 first is the top band line, not the whole list', async ($, on) => {
  await openFlow($, on)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
  expect((await bandLines($))[0]).toBe('● cf mod-band · setup · 0m')
})

test('ScanTotalAndLinear T5 the exports return for empty and lone-delimiter inputs', () => {
  const inputs = ['', ' ', '"', "'", '`', '$(', '${', '\\', '<<', '<<EOF', 'a=', '=', '(', ')', '$((', ';;', '\u0000']
  for (const text of inputs) {
    expect(() => [isImplementCommand(text), isSetupCommand(text), sourcedRootOf(text), cleanupTargetOf(text)]).not.toThrow()
  }
})

test('ScanTotalAndLinear T6 the exports return null for deeply nested input', () => {
  for (const text of ['$('.repeat(100000), '('.repeat(100000), '"$('.repeat(50000), 'bash -c "'.repeat(50000)]) {
    expect(sourcedRootOf(text)).toBeNull()
  }
})

test('ScanTotalAndLinear T4 isImplementCommand returns false for two hundred empty assignments within 50 ms', () => {
  const t = performance.now()
  expect(isImplementCommand("A='' ".repeat(200) + 'make')).toBe(false)
  expect(performance.now() - t).toBeLessThan(50)
})

test('SourcedRootOf T1 a sourced env.sh resolves a variable, quoted or braced', () => {
  expect(sourcedRootOf('S=/tmp/cf-1008-Rez6; . $S/env.sh')).toBe('/tmp/cf-1008-Rez6')
  expect(sourcedRootOf('S="/tmp/cf-1008-Rez6"; . "$S/env.sh"')).toBe('/tmp/cf-1008-Rez6')
  expect(sourcedRootOf("S='/tmp/cf-1008-Rez6'; source ${S}/env.sh")).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf T2 a plain assignment beside the source still resolves', () => {
  expect(sourcedRootOf("A=$'x y'; . /tmp/cf-1008-Rez6/env.sh")).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf T3 a source inside bash -c, eval or sh -c runs and resolves', () => {
  expect(sourcedRootOf("bash -c '. /tmp/cf-1008-Rez6/env.sh'")).toBe('/tmp/cf-1008-Rez6')
  expect(sourcedRootOf('eval ". /tmp/cf-1008-Rez6/env.sh"')).toBe('/tmp/cf-1008-Rez6')
  expect(sourcedRootOf('sh -c ". /tmp/cf-1008-Rez6/env.sh"')).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf T4 an unresolved variable source yields null and a literal one yields the root', () => {
  expect(sourcedRootOf('. $S/env.sh')).toBeNull()
  expect(sourcedRootOf('. "$SESSION/env.sh"')).toBeNull()
  expect(sourcedRootOf('S=/tmp/cf-1008-Rez6; . $S/env.sh')).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf T5 a source inside quotes yields null and a real one yields the root', () => {
  expect(sourcedRootOf('echo "x; . /tmp/cf-1008-Rez6/env.sh"')).toBeNull()
  expect(sourcedRootOf("echo 'x'; . /tmp/cf-1008-Rez6/env.sh")).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf T6 a source inside a heredoc body yields null and one after it yields the root', () => {
  expect(sourcedRootOf('cat <<EOF\n. /tmp/cf-1008-Rez6/env.sh\nEOF')).toBeNull()
  expect(sourcedRootOf('cat <<EOF\nx\nEOF\n. /tmp/cf-1008-Rez6/env.sh')).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf T7 a shard env.sh one level deeper is not a root', () => {
  expect(sourcedRootOf('S=/tmp/cf-1008-Rez6; . $S/shards/A/env.sh')).toBeNull()
  expect(sourcedRootOf('. /tmp/cf-1008-Rez6/shards/A/env.sh')).toBeNull()
})

test('SourcedRootOf T8 the last executed source wins', () => {
  expect(sourcedRootOf('S=/tmp/cf-1008-Ab12; . $S/env.sh && . /tmp/cf-1008-Rez6/env.sh')).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf T9 a source inside a substitution assignment yields null', () => {
  expect(sourcedRootOf('X=$(. /tmp/cf-1008-Rez6/env.sh)')).toBeNull()
})

test('ImplementCommand T1 a shard script with a prefixed PATH assignment runs', () => {
  expect(isImplementCommand('PATH="$HOME"/bin:$PATH cf-pi-run.sh /tmp/cf-1008-Rez6/shards/A g c t')).toBe(true)
})

test('ImplementCommand T2 any assignment quoting before the script still runs it', () => {
  expect(isImplementCommand("A=$'x y' cf-pi-run.sh a")).toBe(true)
  expect(isImplementCommand("A=$'it\\'s' cf-pi-run.sh")).toBe(true)
  expect(isImplementCommand('A=`date` cf-pi-shard.sh')).toBe(true)
  expect(isImplementCommand("FOO='a'\"b\"c cf-pi-worktree.sh")).toBe(true)
})

test('ImplementCommand T3 a script name in a heredoc body does not run it, one after the body does', () => {
  expect(isImplementCommand('cat <<EOF\ncf-pi-run.sh /tmp/cf-1008-Rez6/shards/A\nEOF')).toBe(false)
  expect(isImplementCommand('cat <<EOF\nx\nEOF\ncf-pi-run.sh /tmp/cf-1008-Rez6/shards/A')).toBe(true)
})

test('ImplementCommand T4 a script name in quotes or a comment does not run it, after a separator it does', () => {
  expect(isImplementCommand('echo "x; cf-pi-run.sh"')).toBe(false)
  expect(isImplementCommand('# cf-pi-run.sh')).toBe(false)
  expect(isImplementCommand('echo x; cf-pi-run.sh')).toBe(true)
})

test('ImplementCommand T5 a script run through bash -c runs', () => {
  expect(isImplementCommand('bash -c \'"$SCRIPTS/cf-pi-run.sh" x\'')).toBe(true)
})

test('ImplementCommand T6 a script inside an assignment substitution is data', () => {
  expect(isImplementCommand('X=$("$SCRIPTS/cf-pi-run.sh")')).toBe(false)
})

test('ImplementCommand T7 the existing ImplementOnlyWhenExecuted cases keep their answers', () => {
  expect(isImplementCommand('X=$(date) cf-pi-run.sh')).toBe(true)
  expect(isImplementCommand('bash -x/cf-pi-run.sh')).toBe(false)
})

test('SetupCommand T1 a setup name in quotes or after a separator decides whether it runs', () => {
  expect(isSetupCommand('echo "a; cf-pi-setup.sh"')).toBe(false)
  expect(isSetupCommand('echo a; "$SCRIPTS/cf-pi-setup.sh" s')).toBe(true)
})

test('SetupCommand T2 a setup run inside SESSION=$(...) or backticks runs', () => {
  expect(isSetupCommand('SESSION=$("$SCRIPTS/cf-pi-setup.sh" "mod-band")\necho "$SESSION"')).toBe(true)
  expect(isSetupCommand('S=`"$SCRIPTS/cf-pi-setup.sh" s`')).toBe(true)
})

test('SetupCommand T3 a setup run inside SESSION=$(...) with prefixed assignments runs', () => {
  expect(isSetupCommand("SESSION=$(CF_IMPLEMENTER=omp PI_DISPATCH_CMD='pi --model x' \"$SCRIPTS/cf-pi-setup.sh\" s)")).toBe(true)
})

test('SetupCommand T4 a setup name only named inside a substitution does not run it', () => {
  expect(isSetupCommand('B=$(basename "$SCRIPTS/cf-pi-setup.sh")')).toBe(false)
  expect(isSetupCommand('X=$(echo "a; cf-pi-setup.sh")')).toBe(false)
})

test('SetupCommand T5 a setup name in a heredoc body does not run it, through bash -c it does', () => {
  expect(isSetupCommand('cat <<EOF\n"$SCRIPTS/cf-pi-setup.sh" s\nEOF')).toBe(false)
  expect(isSetupCommand('bash -c \'"$SCRIPTS/cf-pi-setup.sh" s\'')).toBe(true)
})

test('ScannerLimits T1 an export does not bind a variable for a source path', () => {
  expect(sourcedRootOf('export S=/tmp/cf-1008-Rez6; . $S/env.sh')).toBeNull()
})

test('ScannerLimits T2 a default or a substitution in the path is not resolved', () => {
  expect(sourcedRootOf('S=/tmp/cf-1008-Rez6; . ${S:-x}/env.sh')).toBeNull()
  expect(sourcedRootOf('. $(echo /tmp/cf-1008-Rez6)/env.sh')).toBeNull()
})

test('ScannerLimits T3 a function body is scanned as commands, its calls are not tracked', () => {
  expect(sourcedRootOf('f() { . /tmp/cf-1008-Rez6/env.sh; }')).toBe('/tmp/cf-1008-Rez6')
})

test('ScannerLimits T4 a bash -c body inherits the bindings in effect', () => {
  expect(sourcedRootOf("S=/tmp/cf-1008-Rez6; bash -c '. $S/env.sh'")).toBe('/tmp/cf-1008-Rez6')
})

test('ScannerLimits T5 a heredoc inside a substitution does not derail the scan after it', () => {
  expect(sourcedRootOf('X=$(cat <<E2\nls\nE2\n)\n. /tmp/cf-1008-Rez6/env.sh')).toBe('/tmp/cf-1008-Rez6')
})

test('ScannerLimits T6 a bound unquoted value is not word-split into a command', () => {
  expect(sourcedRootOf('CMD=". /tmp/cf-1008-Rez6/env.sh"; $CMD')).toBeNull()
  expect(sourcedRootOf('. /tmp/cf-1008-Rez6/env.sh')).toBe('/tmp/cf-1008-Rez6')
})

test('ScannerLimits T7 a binding made in an eval body does not reach later commands', () => {
  expect(sourcedRootOf('eval S=/tmp/cf-1008-Rez6; . $S/env.sh')).toBeNull()
  expect(sourcedRootOf('S=/tmp/cf-1008-Rez6; . $S/env.sh')).toBe('/tmp/cf-1008-Rez6')
})

test('ScannerLimits T8 a setup run inside a default expansion is not scanned', () => {
  expect(isSetupCommand('SESSION=${X:-$("$SCRIPTS/cf-pi-setup.sh" s)}')).toBe(false)
  expect(isSetupCommand('SESSION=$("$SCRIPTS/cf-pi-setup.sh" s)')).toBe(true)
})

test('ScannerLimits T9 a locale-quoted path keeps its dollar and finds no root', () => {
  expect(sourcedRootOf('. $"/tmp/cf-1008-Rez6/env.sh"')).toBeNull()
  expect(sourcedRootOf('. "/tmp/cf-1008-Rez6/env.sh"')).toBe('/tmp/cf-1008-Rez6')
})

test('ScannerLimits T10 the no-parens function form folds its first body command into the header', () => {
  expect(sourcedRootOf('function f { . /tmp/cf-1008-Rez6/env.sh; }')).toBeNull()
  expect(sourcedRootOf('function f() { . /tmp/cf-1008-Rez6/env.sh; }')).toBe('/tmp/cf-1008-Rez6')
})

test("ImplementOnlyWhenExecuted R4 an ANSI-C quote with an escaped quote in a substitution still runs the script", () => {
  expect(isImplementCommand("X=$(echo $'it\\'s') cf-pi-run.sh")).toBe(true)
})

test('ImplementCommand R2 a variable in the heredoc delimiter keeps the script name in the body as data', () => {
  expect(isImplementCommand('S=EOF; cat <<$S\nEOF\ncf-pi-run.sh x\n$S')).toBe(false)
  expect(isImplementCommand('S=EOF; cat <<$S\nEOF\n$S\ncf-pi-run.sh x')).toBe(true)
})

test("SetupRunOpensFlow R4 a comment with an apostrophe inside SESSION=$(...) still opens the flow", () => {
  expect(isSetupCommand('SESSION=$("$SCRIPTS/cf-pi-setup.sh" s # it\'s the setup\n)')).toBe(true)
})

test('SetupCommand R2 a variable in the heredoc delimiter keeps the setup name in the body as data', () => {
  expect(isSetupCommand('S=EOF; cat <<$S\nEOF\n"$SCRIPTS/cf-pi-setup.sh" s\n$S')).toBe(false)
  expect(isSetupCommand('S=EOF; cat <<$S\nEOF\n$S\n"$SCRIPTS/cf-pi-setup.sh" s')).toBe(true)
})

test("SourcedRootOf R1 an ANSI-C quote with an escaped quote before the source still resolves it", () => {
  expect(sourcedRootOf("X=$(echo $'it\\'s'); . /tmp/cf-1008-Rez6/env.sh")).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf R2 a source inside a substitution with a ")" comment is data', () => {
  expect(sourcedRootOf('X=$(echo hi # a ) b\n. /tmp/cf-1008-Rez6/env.sh\n)')).toBe(null)
})

test('SourcedRootOf R3 a variable in the heredoc delimiter keeps the source in the body as data', () => {
  expect(sourcedRootOf('S=EOF; cat <<$S\nEOF\n. /tmp/cf-1008-Rez6/env.sh\n$S')).toBe(null)
  expect(sourcedRootOf('S=EOF; cat <<$S\nEOF\n$S\n. /tmp/cf-1008-Rez6/env.sh')).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf R4 a hash right after a nested substitution does not hide the source', () => {
  expect(sourcedRootOf('X=$(echo $(echo a)#c); . /tmp/cf-1008-Rez6/env.sh')).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf R5 a variable in the same command resolves for a later value', () => {
  expect(sourcedRootOf('S=/tmp/cf-1008-Rez6 E=$S/env.sh; . $E')).toBe('/tmp/cf-1008-Rez6')
})

test('SourcedRootOf R6 a heredoc with an apostrophe inside a substitution does not hide the source', () => {
  expect(sourcedRootOf(`echo "$(cat <<'EOF'\nfix: don't x\nEOF\n)"\n. /tmp/cf-1008-Rez6/env.sh`)).toBe('/tmp/cf-1008-Rez6')
})

test('ImplementCommand R3 a hash right after a nested substitution does not hide the script', () => {
  expect(isImplementCommand('X=$(echo $(echo a)#c); cf-pi-run.sh x')).toBe(true)
})

test('ImplementCommand R4 a heredoc with an apostrophe inside a substitution does not hide the script', () => {
  expect(isImplementCommand(`echo "$(cat <<'EOF'\nfix: don't x\nEOF\n)"; "$SCRIPTS/cf-pi-run.sh" x`)).toBe(true)
})

test('SetupCommand R3 a hash right after a nested substitution does not hide the setup', () => {
  expect(isSetupCommand('X=$(echo $(echo a)#c); "$SCRIPTS/cf-pi-setup.sh" s')).toBe(true)
})
