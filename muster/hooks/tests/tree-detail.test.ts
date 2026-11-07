import { expect, test } from 'claude-code/testing'
import { readDetail } from '../board.ts'
import { activityOf, arrowTarget, askKey, drawnKeys, isOpenable, issueKey, openKey, openQuestions, reportOf, runKey } from '../tree-model.ts'
import { stringsIn } from './fixtures/band.ts'
import { NOW, RUNS, SESSION, dir, fakeEngine, file, kitWorld } from './fixtures/world.ts'
import type { RunRow, TreeGroup } from '../../types/index.d.ts'

const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()
const meta = (extra: object = {}, started = ago(100)) => JSON.stringify({ name: 'x', repoRoot: '/r', started, ...extra })
const line = (value: object) => JSON.stringify(value)
const toolTitle = (title: string | null) =>
  line({ t: 't', dir: 'in', msg: { method: 'session/update', params: { update: { sessionUpdate: 'tool_call_update', title } } } })

const PANE = {
  component: 'Pane',
  surface: 'terminal',
  requestId: 'muster-tree',
  viewport: { columns: 160, rows: 40 },
  props: { title: 'muster', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const row = (name: string, issue: string | null): RunRow => ({ name, state: 'done', title: 't', plan: null, tools: 0, cost: null, seconds: 10, issue, exitReason: null })

test('TreeDetail D1 the report gives its first line, and a BLOCKED report its body as one line', () => {
  expect(reportOf(null)).toEqual({ report: null, reason: null })
  expect(reportOf('DONE\nall green')).toEqual({ report: 'DONE', reason: null })
  expect(reportOf('BLOCKED\n  needs the API key\n  from the vault\n')).toEqual({ report: 'BLOCKED', reason: 'needs the API key from the vault' })
  expect(reportOf('BLOCKED\n')).toEqual({ report: 'BLOCKED', reason: null })
})

test('TreeDetail D2 a question is open until an ANSWER of its number exists', () => {
  expect(openQuestions(['QUESTION-1.json', 'ANSWER-1.json', 'QUESTION-3.json', 'QUESTION-2.json', 'QUESTION-4.json.tmp'])).toEqual([2, 3])
  expect(openQuestions([])).toEqual([])
})

const said = (text: string) => line({ t: 't', dir: 'in', msg: { method: 'session/update', params: { update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } } } })
const planOf = (...entries: [string, string][]) =>
  line({ t: 't', dir: 'in', msg: { method: 'session/update', params: { update: { sessionUpdate: 'plan', entries: entries.map(([status, content]) => ({ status, content, priority: 'medium' })) } } } })
const quietActivity = { plan: null, said: [], denied: [] }

test('TreeDetail D3 activity is the worker\'s latest plan and words and the permissions refused it, never its commands', () => {
  const noise = line({ t: 't', dir: 'in', msg: { method: 'session/update', params: { update: { sessionUpdate: 'usage_update', used: 1 } } } })
  const deny = line({ t: 't', dir: 'client-decision', msg: { decision: 'deny', by: 'policy' } })
  const allow = line({ t: 't', dir: 'client-decision', msg: { decision: 'allow', by: 'coordinator' } })
  const text = [
    planOf(['pending', 'old']),
    said('Reading '), noise, said('the code.'), toolTitle('sed -n 1,9p a.ts'),
    'not json',
    said('Now the tests.'), allow, deny,
    planOf(['completed', 'a'], ['completed', 'b'], ['in_progress', 'c'], ['in_progress', 'd'], ['pending', 'e'], ['pending', 'f']),
    '',
  ].join('\n')
  expect(activityOf(text)).toEqual({
    plan: { done: 2, total: 6, shown: [{ status: 'completed', content: 'b' }, { status: 'in_progress', content: 'c' }, { status: 'in_progress', content: 'd' }, { status: 'pending', content: 'e' }] },
    said: ['Reading the code.', 'Now the tests.'],
    denied: ['permission deny by policy'],
  })
  const many = Array.from({ length: 5 }, (_, i) => [said(`step ${i}`), toolTitle('x')].join('\n')).join('\n')
  expect(activityOf(many).said).toEqual(['step 2', 'step 3', 'step 4'])
  expect(activityOf(said('x'.repeat(500))).said[0]?.length).toBeLessThanOrEqual(240)
  expect(activityOf(said('ran /w/t/a.ts'), '/w/t').said).toEqual(['ran ./a.ts'])
  expect(activityOf(toolTitle('bun test'))).toEqual(quietActivity)
})

test('TreeDetail D4 the drawn keys skip a folded issue\'s runs, and a single arrow walks them', () => {
  const groups: TreeGroup[] = [
    { issue: 'I', runs: [row('a', 'I'), row('b', 'I')] },
    { issue: null, runs: [row('c', null)] },
  ]
  expect(drawnKeys(groups, [], null, false)).toEqual([issueKey('I'), runKey('a'), runKey('b'), issueKey(null), runKey('c')])
  const keys = drawnKeys(groups, [issueKey('I')], null, false)
  expect(keys).toEqual([issueKey('I'), issueKey(null), runKey('c')])
  const arrow = (by: number) => ({ origin: { kind: 'person' }, by })
  expect(arrowTarget(arrow(1), keys, issueKey('I'))).toBe(issueKey(null))
  expect(arrowTarget(arrow(-1), keys, issueKey('I'))).toBeNull()
  expect(arrowTarget(arrow(1), keys, null)).toBe(issueKey('I'))
  expect(arrowTarget(arrow(5), keys, issueKey('I'))).toBeNull()
  expect(arrowTarget({ ...arrow(1), pointer: { column: 0, row: 0 } }, keys, issueKey('I'))).toBeNull()
  expect(arrowTarget({ origin: { kind: 'plugin' }, by: 1 }, keys, issueKey('I'))).toBeNull()
})

const RUN = `${RUNS}/q`
const DETAIL_WORLD = {
  dirs: { [RUNS]: [dir('q')], [RUN]: [] },
  files: {
    [`${RUN}/meta.json`]: meta({ issue: 'https://example.com/I' }),
    [`${RUN}/phase.json`]: line({ phase: 'running', title: 'Q' }),
    [`${RUN}/QUESTION-1.json`]: line({ paths: ['/etc/hosts'] }),
    [`${RUN}/ANSWER-1.json`]: '{}',
    [`${RUN}/QUESTION-2.json`]: line({ paths: ['/a', '/b'] }),
    [`${RUN}/events.jsonl`]: [said('Testing.'), toolTitle('git commit')].join('\n'),
  },
}

test('TreeDetail D5 a run\'s detail reads its report, open questions with their paths, and recent activity', async () => {
  const files = { ...DETAIL_WORLD.files, [`${RUN}/REPORT.md`]: 'BLOCKED\nno key' }
  const world = { ...DETAIL_WORLD, dirs: { ...DETAIL_WORLD.dirs, [RUN]: Object.keys(files).filter((p) => p.startsWith(`${RUN}/`)).map((p) => file(p.slice(RUN.length + 1))) }, files }
  expect(await readDetail(fakeEngine(world).$, 'q')).toEqual({
    name: 'q',
    report: 'BLOCKED',
    reason: 'no key',
    questions: [{ n: 2, paths: ['/a', '/b'] }],
    activity: { ...quietActivity, said: ['Testing.'] },
  })
  expect(await readDetail(fakeEngine({ dirs: { [RUNS]: [] } }).$, 'gone')).toBeNull()
  // A later time than the read above, so the cached tail does not answer.
  const later = world.dirs[RUN].map((entry) => (entry.name === 'events.jsonl' ? { ...entry, mtimeMs: 2 } : entry))
  const unreadable = { dirs: { ...world.dirs, [RUN]: later }, files: { ...files, [`${RUN}/events.jsonl`]: { deny: 'EACCES' } } }
  expect((await readDetail(fakeEngine(unreadable).$, 'q'))?.activity).toBeNull()
  expect(await readDetail(fakeEngine(world).$, '../q')).toBeNull()
})

const PANE_WORLD = {
  dirs: { [RUNS]: [dir('a'), dir('c')], [`${RUNS}/a`]: [file('REPORT.md'), file('events.jsonl')], [`${RUNS}/c`]: [] },
  files: {
    [`${RUNS}/a/meta.json`]: meta({ issue: 'https://example.com/I' }),
    [`${RUNS}/a/phase.json`]: line({ phase: 'idle', title: 'Build A' }),
    [`${RUNS}/a/REPORT.md`]: 'BLOCKED\nthe fixture is missing',
    [`${RUNS}/a/events.jsonl`]: [planOf(['in_progress', 'Wire the fixture']), said('Looking for the fixture.')].join('\n'),
    [`${RUNS}/c/meta.json`]: meta(),
    [`${RUNS}/c/phase.json`]: line({ phase: 'running', title: 'Probe C' }),
  },
}

async function openPane($: any, on: any, failing: string[] = []) {
  const w = kitWorld(on, { ...PANE_WORLD, failing })
  on('command.register', () => ({ value: { command: 'muster-runs' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start(SESSION)
  await w.clock.settle()
  await $.command.run({ command: 'muster-runs', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  await w.clock.settle()
  return w
}

test('TreeDetail D5b an unchanged events log is not read again; a changed one is', async () => {
  const name = 'cache-probe'
  const runDir = `${RUNS}/${name}`
  const events = { ...file('events.jsonl'), size: 10, mtimeMs: 1 }
  const files = { [`${runDir}/events.jsonl`]: said('one') }
  const engine = fakeEngine({ dirs: { [runDir]: [events] }, files })
  expect((await readDetail(engine.$, name))?.activity?.said).toEqual(['one'])
  expect((await readDetail(engine.$, name))?.activity?.said).toEqual(['one'])
  expect(engine.tails).toHaveLength(1)
  const grown = fakeEngine({ dirs: { [runDir]: [{ ...events, size: 20 }] }, files: { [`${runDir}/events.jsonl`]: [said('one'), toolTitle('x'), said('two')].join('\n') } })
  expect((await readDetail(grown.$, name))?.activity?.said).toEqual(['one', 'two'])
})

test('TreeDetail D6 pressing an issue folds its runs away and pressing it again brings them back', async ($, on) => {
  await openPane($, on)
  expect(stringsIn(await $.ui.render(PANE)).join(' ')).toContain('Build A')
  await $.ui.press({ plugin: 'muster', key: issueKey('https://example.com/I') })
  const folded = stringsIn(await $.ui.render(PANE)).join(' ')
  expect(folded).not.toContain('Build A')
  expect(folded).toContain('►')
  expect(folded).toContain('Probe C')
  await $.ui.press({ plugin: 'muster', key: issueKey('https://example.com/I') })
  expect(stringsIn(await $.ui.render(PANE)).join(' ')).toContain('Build A')
})

test('TreeDetail D7 pressing a run shows its detail beneath it, and pressing it again hides the detail', async ($, on) => {
  await openPane($, on)
  await $.ui.render(PANE)
  await $.ui.press({ plugin: 'muster', key: runKey('a') })
  const shown = stringsIn(await $.ui.render(PANE)).join(' ')
  expect(shown).toContain('the fixture is missing')
  expect(shown).toContain('Wire the fixture')
  expect(shown).toContain('Looking for the fixture.')
  await $.ui.press({ plugin: 'muster', key: runKey('a') })
  expect(stringsIn(await $.ui.render(PANE)).join(' ')).not.toContain('the fixture is missing')
})

test('TreeDetail D8 the open and hand-off Buttons join the arrow walk where they are drawn', () => {
  const groups: TreeGroup[] = [
    { issue: 'https://example.com/I', runs: [row('a', 'https://example.com/I'), row('b', 'https://example.com/I')] },
    { issue: 'not a link', runs: [row('n', 'not a link')] },
    { issue: null, runs: [row('c', null)] },
  ]
  expect(drawnKeys(groups, [], 'a', true)).toEqual([
    issueKey('https://example.com/I'),
    openKey('https://example.com/I'),
    runKey('a'),
    askKey('a'),
    runKey('b'),
    issueKey('not a link'),
    runKey('n'),
    issueKey(null),
    runKey('c'),
  ])
  expect(drawnKeys(groups, [issueKey('https://example.com/I')], 'a', false)).toEqual([issueKey('https://example.com/I'), issueKey('not a link'), runKey('n'), issueKey(null), runKey('c')])
})

test('TreeDetail D9 only a web or obsidian link is opened', () => {
  expect(isOpenable('https://example.com/I')).toBe(true)
  expect(isOpenable('obsidian://open?vault=v&file=x')).toBe(true)
  expect(isOpenable('file:///etc/passwd')).toBe(false)
  expect(isOpenable('/Applications/Calculator.app')).toBe(false)
  expect(isOpenable('-a Terminal')).toBe(false)
})

test('TreeDetail D10 the Open issue Button runs the system open on the issue URL', async ($, on) => {
  const w = await openPane($, on)
  await $.ui.render(PANE)
  await $.ui.press({ plugin: 'muster', key: openKey('https://example.com/I') })
  expect(w.commands).toContainEqual(['open', 'https://example.com/I'])
})

test('TreeDetail D11 the hand-off Button closes the pane and appends a line about the run to the prompt', async ($, on) => {
  const closed: unknown[] = []
  const filled: any[] = []
  on('ui.close', (_: any, e: any) => {
    closed.push(e.id)
    return { value: undefined }
  })
  on('prompt.fill', (_: any, e: any) => {
    filled.push(e)
    return { isFilled: true }
  })
  await openPane($, on)
  await $.ui.render(PANE)
  await $.ui.press({ plugin: 'muster', key: runKey('a') })
  await $.ui.render(PANE)
  await $.ui.press({ plugin: 'muster', key: askKey('a') })
  expect(closed).toContain('muster-tree')
  expect(filled).toHaveLength(1)
  expect(filled[0].text).toContain('muster run a')
  expect(filled[0].text).toContain('blocked')
  expect(filled[0].text).toContain('https://example.com/I')
  expect(filled[0].mode).toBe('append')
})

test('TreeDetail D12 an open that exits non-zero falls back to xdg-open', async ($, on) => {
  const w = await openPane($, on, ['open'])
  await $.ui.render(PANE)
  await $.ui.press({ plugin: 'muster', key: openKey('https://example.com/I') })
  expect(w.commands).toContainEqual(['xdg-open', 'https://example.com/I'])
})
