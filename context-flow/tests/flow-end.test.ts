import { expect, test } from 'claude-code/testing'
import { BAND, bandLines } from './fixtures/band.ts'
import { cleanupTargetOf } from '../hooks/cf-signals.ts'
import { BENEATH, ENV, ENV2, NOW, ROOT, ROOT2, SESSION, ok, openFlow, world } from './fixtures/world.ts'

const first = async ($: any) => (await bandLines($))[0]
const CLEANUP = '. "/tmp/cf-1008-Rez6/env.sh"\n[ -n "${CLEANUP_SCRIPT:-}" ] && [ -x "$CLEANUP_SCRIPT" ] && bash "$CLEANUP_SCRIPT"'
const ZERO = { setup: 0, research: 0, plan: 0, implement: 0, review: 0, waiting: 0 }
const ASYNC = { result: { status: 'async_launched', agentId: 'a1', description: 'd', prompt: 'p', outputFile: '/o' } }

const bash = async ($: any, w: any, command: string) => {
  await $.tool.call({ tool: 'Bash', command })
  await w.clock.settle()
}

test('CleanupClosesFlow T1 the cleanup script clears the band and stores the flow', async ($, on) => {
  on('tool.call', { tool: 'Agent' }, () => ASYNC)
  const { w, bash: answer } = await openFlow($, on)
  await w.clock.advance(60_000)
  await $.tool.call({ tool: 'Agent', subagent_type: 'cf:research', prompt: 'p', description: 'd' })
  await w.clock.advance(120_000)
  answer.answer = ok('')
  await bash($, w, CLEANUP)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
  expect(w.flows()).toEqual([{ v: 1, root: ROOT, slug: 'mod-band', startedAt: NOW, endedAt: NOW + 180000, outcome: 'cleanup', phases: { setup: 60000, research: 120000, plan: 0, implement: 0, review: 0, waiting: 0 } }])
})

test('CleanupClosesFlow T2 sourcing the closed root again does not reopen a band', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, CLEANUP)
  await bash($, w, '. "/tmp/cf-1008-Rez6/env.sh"\n"$SCRIPTS/cf-pi-cleanup.sh" "/tmp/cf-1008-Rez6" "$CF_SLUG"')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
  expect(w.flows()).toHaveLength(1)
})

test('CleanupClosesFlow T3 a literal cleanup.sh of the open root closes it', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, `bash ${ROOT}/cleanup.sh`)
  expect(w.flows()[0].outcome).toBe('cleanup')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('CleanupClosesFlow T4 another root cleanup changes nothing', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, 'bash /tmp/cf-0101-Zz99/cleanup.sh')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
  expect(w.hasStoreKey('flows')).toBe(false)
})

test('CleanupClosesFlow T5 the record holds nothing from env.sh but the slug', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, CLEANUP)
  const text = JSON.stringify(w.flows())
  expect(text).not.toContain('sk-live-SECRET')
  expect(text).not.toContain('CLEANUP_SCRIPT')
  expect(Object.keys(w.flows()[0])).toEqual(['v', 'root', 'slug', 'startedAt', 'endedAt', 'outcome', 'phases'])
})

test('NewRootAbandonsFlow T1 a new SESSION line closes the open flow as abandoned', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { files: { [`${ROOT}/env.sh`]: ENV, [`${ROOT2}/env.sh`]: ENV2 } })
  await w.clock.advance(90_000)
  answer.answer = ok(`SESSION=${ROOT2}\n`)
  await bash($, w, 'cf setup again')
  expect(w.flows()).toEqual([{ v: 1, root: ROOT, slug: 'mod-band', startedAt: NOW, endedAt: NOW + 90000, outcome: 'abandoned', phases: { ...ZERO, setup: 90000 } }])
  expect(await first($)).toBe('● cf other-flow · setup · 0m')
})

test('NewRootAbandonsFlow T2 sourcing the open root again stores nothing', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, '. "/tmp/cf-1008-Rez6/env.sh" && ls')
  expect(w.hasStoreKey('flows')).toBe(false)
})

test('NewRootAbandonsFlow T3 sourcing another root closes the open one', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, '. /tmp/cf-1008-Ab12/env.sh && ls')
  expect(w.flows()[0]).toMatchObject({ root: ROOT, outcome: 'abandoned' })
})

test('SessionEndClosesFlow T1 ending the session stores the open flow', async ($, on) => {
  const { w } = await openFlow($, on)
  await w.clock.advance(300_000)
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: false })
  expect(w.flows()).toEqual([{ v: 1, root: ROOT, slug: 'mod-band', startedAt: NOW, endedAt: NOW + 300000, outcome: 'session-end', phases: { ...ZERO, setup: 300000 } }])
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('SessionEndClosesFlow T2 with no flow the store is not touched', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: false })
  expect(w.hasStoreKey('flows')).toBe(false)
  expect(w.storeCalls).toEqual([])
})

test('SessionEndClosesFlow T3 a refused store still lets the session end', async ($, on) => {
  await openFlow($, on, { store: 'refuse' })
  expect(await $.session.end({ reason: 'clear', sessionId: 's1', resume: false })).toEqual({ sessionId: 's1' })
})

const record = (i: number) => ({ v: 1, root: `/tmp/cf-0101-${String(i).padStart(4, '0')}`, slug: null, startedAt: 0, endedAt: 1, outcome: 'cleanup', phases: ZERO })

test('FlowHistoryBounded T1 the 101st record pushes out the oldest', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { files: { [`${ROOT}/env.sh`]: ENV }, store: { flows: Array.from({ length: 100 }, (_, i) => record(i)) } })
  answer.answer = ok('')
  await bash($, w, CLEANUP)
  expect(w.flows()).toHaveLength(100)
  expect(w.flows()[0].root).toBe('/tmp/cf-0101-0001')
  expect(w.flows()[99].root).toBe(ROOT)
})

test('FlowHistoryBounded T2 a store value that is not a list is replaced', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { store: { flows: 'garbage' } })
  answer.answer = ok('')
  await bash($, w, CLEANUP)
  expect(w.flows()).toHaveLength(1)
  expect(w.flows()[0].root).toBe(ROOT)
})

test('FlowHistoryBounded T3 a refused store leaves the band cleared', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { store: 'refuse' })
  answer.answer = ok('')
  await bash($, w, CLEANUP)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('CleanupScriptOnlyWhenExecuted T1 grepping the variable name leaves the flow open', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, 'grep -n CLEANUP_SCRIPT "/tmp/cf-1008-Rez6/env.sh"')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
  expect(w.hasStoreKey('flows')).toBe(false)
})

test('CleanupScriptOnlyWhenExecuted T2 a guarded bash of the variable is any', () => {
  expect(cleanupTargetOf('. "/tmp/cf-1008-Rez6/env.sh"\n[ -n "${CLEANUP_SCRIPT:-}" ] && [ -x "$CLEANUP_SCRIPT" ] && bash "$CLEANUP_SCRIPT"')).toBe('any')
})

test('CleanupScriptOnlyWhenExecuted T3 a case arm bash of the variable is any', () => {
  expect(cleanupTargetOf('case "$R" in OK*|NOOP*) bash "$CLEANUP_SCRIPT" >/dev/null 2>&1;; esac')).toBe('any')
})

test('CleanupScriptOnlyWhenExecuted T4 a braced group bash of the variable is any', () => {
  expect(cleanupTargetOf('. /tmp/cf-1008-Rez6/env.sh && { [ -x "${CLEANUP_SCRIPT:-}" ] && bash "$CLEANUP_SCRIPT" >/dev/null 2>&1; }')).toBe('any')
})

test('CleanupScriptOnlyWhenExecuted T5 test operands are not an execution', () => {
  expect(cleanupTargetOf('[ -n "${CLEANUP_SCRIPT:-}" ] && [ -x "$CLEANUP_SCRIPT" ]')).toBe(null)
})

test('CleanupScriptOnlyWhenExecuted T6 an assignment is not an execution', () => {
  expect(cleanupTargetOf('CLEANUP_SCRIPT="$FLOW/cleanup.sh"')).toBe(null)
})

test('CleanupScriptOnlyWhenExecuted T7 an assignment prefix is not an execution', () => {
  expect(cleanupTargetOf('X=1 CLEANUP_SCRIPT=$S/cleanup.sh bash t.sh')).toBe(null)
})

test('CleanupScriptOnlyWhenExecuted T8 prose is not an execution', () => {
  expect(cleanupTargetOf('echo "exposes PI_PROTOCOL, CLEANUP_SCRIPT, thresholds"')).toBe(null)
})

test('CleanupScriptOnlyWhenExecuted T9 bash -n is not an execution', () => {
  expect(cleanupTargetOf('bash -n "$CLEANUP_SCRIPT"')).toBe(null)
})

test('LiteralCleanupOnlyWhenExecuted T1 reading cleanup.sh leaves the flow open', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  await bash($, w, 'cat /tmp/cf-1008-Rez6/cleanup.sh | head -60')
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
  expect(w.hasStoreKey('flows')).toBe(false)
})

test('LiteralCleanupOnlyWhenExecuted T2 bash of the literal path yields its root', () => {
  expect(cleanupTargetOf('bash /tmp/cf-1008-Rez6/cleanup.sh')).toBe('/tmp/cf-1008-Rez6')
})

test('LiteralCleanupOnlyWhenExecuted T3 a direct run with redirects yields its root', () => {
  expect(cleanupTargetOf('/tmp/cf-1008-Rez6/cleanup.sh >/dev/null 2>&1')).toBe('/tmp/cf-1008-Rez6')
})

test('LiteralCleanupOnlyWhenExecuted T4 ls of the path yields nothing', () => {
  expect(cleanupTargetOf('ls /tmp/cf-1008-Rez6/cleanup.sh')).toBe(null)
})

test('LiteralCleanupOnlyWhenExecuted T5 the pi cleanup script yields nothing', () => {
  expect(cleanupTargetOf('"$SCRIPTS/cf-pi-cleanup.sh" "/tmp/cf-1008-Rez6" "$CF_SLUG"')).toBe(null)
})

const NOFLOW_CLEANUP = (root: string) => `. "${root}/env.sh"\n[ -n "\${CLEANUP_SCRIPT:-}" ] && [ -x "$CLEANUP_SCRIPT" ] && bash "$CLEANUP_SCRIPT"`

test('OpenAndCloseInOneCommandStoresNothing T1 a source-and-cleanup command stores nothing', async ($, on) => {
  const w = world(on, { beneath: BENEATH, files: { [`${ROOT}/env.sh`]: ENV } })
  on('tool.call', { tool: 'Bash' }, () => ok(''))
  await $.session.start(SESSION)
  await w.clock.settle()
  await bash($, w, NOFLOW_CLEANUP(ROOT))
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
  expect(w.storeCalls).toEqual([])
})

test('OpenAndCloseInOneCommandStoresNothing T2 a source and literal cleanup stores nothing', async ($, on) => {
  const w = world(on, { beneath: BENEATH, files: { [`${ROOT}/env.sh`]: ENV } })
  on('tool.call', { tool: 'Bash' }, () => ok(''))
  await $.session.start(SESSION)
  await w.clock.settle()
  await bash($, w, `. ${ROOT}/env.sh && bash ${ROOT}/cleanup.sh`)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
  expect(w.storeCalls).toEqual([])
})

test('OpenAndCloseInOneCommandStoresNothing T3 the closed root does not reopen', async ($, on) => {
  const w = world(on, { beneath: BENEATH, files: { [`${ROOT}/env.sh`]: ENV } })
  on('tool.call', { tool: 'Bash' }, () => ok(''))
  await $.session.start(SESSION)
  await w.clock.settle()
  await bash($, w, NOFLOW_CLEANUP(ROOT))
  await bash($, w, `. "${ROOT}/env.sh" && ls`)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('OpenAndCloseInOneCommandStoresNothing T4 an open flow abandoned by the batch is still stored', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { files: { [`${ROOT}/env.sh`]: ENV, [`${ROOT2}/env.sh`]: ENV2 } })
  answer.answer = ok('')
  await w.clock.advance(90_000)
  await bash($, w, NOFLOW_CLEANUP(ROOT2))
  expect(w.flows()).toEqual([{ v: 1, root: ROOT, slug: 'mod-band', startedAt: NOW, endedAt: NOW + 90000, outcome: 'abandoned', phases: { ...ZERO, setup: 90000 } }])
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})
