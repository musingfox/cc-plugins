import { expect, test } from 'claude-code/testing'
import { BAND } from './fixtures/band.ts'
import { cleanupTargetOf } from '../hooks/cf-signals.ts'
import { BENEATH, ENV, ENV2, NOW, ROOT, ROOT2, SESSION, bareBash, ok, openFlow, world } from './fixtures/world.ts'
import { ASYNC, bash, first } from './fixtures/helpers.ts'

const cleanupAt = (root: string) => `. "${root}/env.sh"\n[ -n "\${CLEANUP_SCRIPT:-}" ] && [ -x "$CLEANUP_SCRIPT" ] && bash "$CLEANUP_SCRIPT"`
const CLEANUP = cleanupAt(ROOT)
const ZERO = { setup: 0, research: 0, plan: 0, implement: 0, review: 0, waiting: 0 }

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
  expect(cleanupTargetOf(CLEANUP)).toEqual({ kind: 'any' })
})

test('CleanupScriptOnlyWhenExecuted T3 a case arm bash of the variable is any', () => {
  expect(cleanupTargetOf('case "$R" in OK*|NOOP*) bash "$CLEANUP_SCRIPT" >/dev/null 2>&1;; esac')).toEqual({ kind: 'any' })
})

test('CleanupScriptOnlyWhenExecuted T4 a braced group bash of the variable is any', () => {
  expect(cleanupTargetOf('. /tmp/cf-1008-Rez6/env.sh && { [ -x "${CLEANUP_SCRIPT:-}" ] && bash "$CLEANUP_SCRIPT" >/dev/null 2>&1; }')).toEqual({ kind: 'any' })
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
  expect(cleanupTargetOf('bash /tmp/cf-1008-Rez6/cleanup.sh')).toEqual({ kind: 'roots', roots: ['/tmp/cf-1008-Rez6'] })
})

test('LiteralCleanupOnlyWhenExecuted T3 a direct run with redirects yields its root', () => {
  expect(cleanupTargetOf('/tmp/cf-1008-Rez6/cleanup.sh >/dev/null 2>&1')).toEqual({ kind: 'roots', roots: ['/tmp/cf-1008-Rez6'] })
})

test('LiteralCleanupOnlyWhenExecuted T4 ls of the path yields nothing', () => {
  expect(cleanupTargetOf('ls /tmp/cf-1008-Rez6/cleanup.sh')).toBe(null)
})

test('LiteralCleanupOnlyWhenExecuted T5 the pi cleanup script yields nothing', () => {
  expect(cleanupTargetOf('"$SCRIPTS/cf-pi-cleanup.sh" "/tmp/cf-1008-Rez6" "$CF_SLUG"')).toBe(null)
})

test('OpenAndCloseInOneCommandStoresNothing T1 a source-and-cleanup command stores nothing', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, cleanupAt(ROOT))
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
  expect(w.storeCalls).toEqual([])
})

test('OpenAndCloseInOneCommandStoresNothing T2 a source and literal cleanup stores nothing', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, `. ${ROOT}/env.sh && bash ${ROOT}/cleanup.sh`)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
  expect(w.storeCalls).toEqual([])
})

test('OpenAndCloseInOneCommandStoresNothing T3 the closed root does not reopen', async ($, on) => {
  const w = await bareBash($, on, ok(''))
  await bash($, w, cleanupAt(ROOT))
  await bash($, w, `. "${ROOT}/env.sh" && ls`)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('OpenAndCloseInOneCommandStoresNothing T4 an open flow abandoned by the batch is still stored', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { files: { [`${ROOT}/env.sh`]: ENV, [`${ROOT2}/env.sh`]: ENV2 } })
  answer.answer = ok('')
  await w.clock.advance(90_000)
  await bash($, w, cleanupAt(ROOT2))
  expect(w.flows()).toEqual([{ v: 1, root: ROOT, slug: 'mod-band', startedAt: NOW, endedAt: NOW + 90000, outcome: 'abandoned', phases: { ...ZERO, setup: 90000 } }])
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('CleanupScriptOnlyWhenExecuted R1 a substitution that only reads the script closes nothing', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on)
  answer.answer = ok('')
  const command = 'D=$(dirname "$CLEANUP_SCRIPT")'
  expect(cleanupTargetOf(command)).toBe(null)
  await bash($, w, command)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
  expect(w.hasStoreKey('flows')).toBe(false)
})

test('CleanupTargets T2 every literal cleanup root counts in command order', () => {
  expect(cleanupTargetOf('bash /tmp/cf-1008-Ab12/cleanup.sh; bash /tmp/cf-1008-Rez6/cleanup.sh')).toEqual({ kind: 'roots', roots: ['/tmp/cf-1008-Ab12', '/tmp/cf-1008-Rez6'] })
})

test('CleanupTargets T3 a repeated literal cleanup root is listed once', () => {
  expect(cleanupTargetOf('bash /tmp/cf-1008-Rez6/cleanup.sh; bash /tmp/cf-1008-Rez6/cleanup.sh')).toEqual({ kind: 'roots', roots: ['/tmp/cf-1008-Rez6'] })
})

test('CleanupTargets T6 a variable cleanup is any even beside a literal root', () => {
  expect(cleanupTargetOf('bash "$CLEANUP_SCRIPT"')).toEqual({ kind: 'any' })
  expect(cleanupTargetOf('bash $CLEANUP_SCRIPT; bash /tmp/cf-1008-Rez6/cleanup.sh')).toEqual({ kind: 'any' })
})

test('CleanupTargets T7 ls names no cleanup target', () => {
  expect(cleanupTargetOf('ls')).toBe(null)
})

test('CleanupClosesFlow T6 a command with the open root cleanup among others closes the flow', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { files: { [`${ROOT}/env.sh`]: ENV, [`${ROOT2}/env.sh`]: ENV2 } })
  answer.answer = ok('')
  await bash($, w, `bash ${ROOT2}/cleanup.sh; bash ${ROOT}/cleanup.sh`)
  expect(w.flows()).toHaveLength(1)
  expect(w.flows()[0]).toMatchObject({ root: ROOT, outcome: 'cleanup' })
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('CleanupClosesFlow T7 a command that cleans only another root leaves the flow open', async ($, on) => {
  const { w, bash: answer } = await openFlow($, on, { files: { [`${ROOT}/env.sh`]: ENV, [`${ROOT2}/env.sh`]: ENV2 } })
  answer.answer = ok('')
  await bash($, w, `bash ${ROOT2}/cleanup.sh`)
  expect(await first($)).toBe('● cf mod-band · setup · 0m')
  expect(w.hasStoreKey('flows')).toBe(false)
})

test('CleanupTargetOf T1 a cleanup name inside a substitution or backticks is data, a bare runner is any', () => {
  expect(cleanupTargetOf('X=$(bash $CLEANUP_SCRIPT)')).toBeNull()
  expect(cleanupTargetOf('X=`bash $CLEANUP_SCRIPT`')).toBeNull()
  expect(cleanupTargetOf('bash "$CLEANUP_SCRIPT"')).toEqual({ kind: 'any' })
})

test('CleanupTargetOf T2 a cleanup name in quotes or a comment does not run', () => {
  expect(cleanupTargetOf('echo "bash $CLEANUP_SCRIPT"')).toBeNull()
  expect(cleanupTargetOf('grep -q \'bash "$CLEANUP_SCRIPT"\' f')).toBeNull()
  expect(cleanupTargetOf('# bash $CLEANUP_SCRIPT')).toBeNull()
})

test('CleanupTargetOf T3 a cleanup name in a heredoc body is data, one after the body is any', () => {
  expect(cleanupTargetOf('cat <<EOF\nbash $CLEANUP_SCRIPT\nEOF')).toBeNull()
  expect(cleanupTargetOf('cat <<EOF\nx\nEOF\nbash $CLEANUP_SCRIPT')).toEqual({ kind: 'any' })
})

test('CleanupTargetOf T4 a cleanup run after an assignment with a quoted value is any', () => {
  expect(cleanupTargetOf("A=$'x y'\nbash \"$CLEANUP_SCRIPT\"")).toEqual({ kind: 'any' })
  expect(cleanupTargetOf('A=$\'x;y\' bash "$CLEANUP_SCRIPT"')).toEqual({ kind: 'any' })
})

test('CleanupTargetOf T5 a cleanup run through bash -c is any, through eval is the literal root', () => {
  expect(cleanupTargetOf('bash -c \'bash "$CLEANUP_SCRIPT"\'')).toEqual({ kind: 'any' })
  expect(cleanupTargetOf('eval "bash /tmp/cf-1008-Rez6/cleanup.sh"')).toEqual({ kind: 'roots', roots: ['/tmp/cf-1008-Rez6'] })
})

test('CleanupTargetOf T6 a resolved variable names a literal root, another value is null', () => {
  expect(cleanupTargetOf('D=/tmp/cf-1008-Rez6; bash $D/cleanup.sh')).toEqual({ kind: 'roots', roots: ['/tmp/cf-1008-Rez6'] })
  expect(cleanupTargetOf('CLEANUP_SCRIPT=/tmp/cf-1008-Rez6/cleanup.sh; bash "$CLEANUP_SCRIPT"')).toEqual({ kind: 'roots', roots: ['/tmp/cf-1008-Rez6'] })
  expect(cleanupTargetOf('CLEANUP_SCRIPT=/x/y.sh; bash "$CLEANUP_SCRIPT"')).toBeNull()
})

test('CleanupTargetOf T7 a braced cleanup name is any, a defaulted one is null', () => {
  expect(cleanupTargetOf('bash "${CLEANUP_SCRIPT}"')).toEqual({ kind: 'any' })
  expect(cleanupTargetOf('bash "${CLEANUP_SCRIPT:-}"')).toBeNull()
})

test("CleanupTargetOf R1 a comment with an apostrophe inside a substitution does not hide the cleanup", () => {
  expect(cleanupTargetOf("X=$(ls # don't\n)\nbash \"$CLEANUP_SCRIPT\"")).toEqual({ kind: 'any' })
})

test('CleanupTargetOf R2 a comment holding ")" inside a data substitution keeps the cleanup as data', () => {
  expect(cleanupTargetOf('X=$(echo hi # a ) b\nbash "$CLEANUP_SCRIPT"\n)')).toBe(null)
})

test('CleanupTargetOf R3 a variable in the heredoc delimiter keeps the cleanup in the body as data', () => {
  expect(cleanupTargetOf('S=EOF; cat <<$S\nEOF\nbash "$CLEANUP_SCRIPT"\n$S')).toBe(null)
  expect(cleanupTargetOf('S=EOF; cat <<$S\nEOF\n$S\nbash "$CLEANUP_SCRIPT"')).toEqual({ kind: 'any' })
})

test('CleanupTargetOf R4 a hash right after a nested substitution does not hide the cleanup', () => {
  expect(cleanupTargetOf('X=$(echo $(echo a)#c); bash "$CLEANUP_SCRIPT"')).toEqual({ kind: 'any' })
})
