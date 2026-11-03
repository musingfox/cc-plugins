import { expect, test } from 'claude-code/testing'
import { readDetail } from '../board.ts'
import { activityOf, arrowTarget, drawnKeys, issueKey, openQuestions, reportOf, runKey } from '../tree-model.ts'
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

test('TreeDetail D3 activity keeps the last ten tool titles and permission decisions, skipping noise and repeats', () => {
  const noise = line({ t: 't', dir: 'in', msg: { method: 'session/update', params: { update: { sessionUpdate: 'usage_update', used: 1 } } } })
  const decision = line({ t: 't', dir: 'client-decision', msg: { decision: 'deny', by: 'policy' } })
  const routine = line({ t: 't', dir: 'client-decision', msg: { decision: 'allow', by: 'policy' } })
  const text = [toolTitle('first'), noise, 'not json', toolTitle(null), toolTitle('same'), routine, toolTitle('same'), decision, ''].join('\n')
  expect(activityOf(text)).toEqual(['first', 'same', 'permission deny by policy'])
  const many = Array.from({ length: 15 }, (_, i) => toolTitle(`cmd ${i}`)).join('\n')
  expect(activityOf(many)).toEqual(Array.from({ length: 10 }, (_, i) => `cmd ${i + 5}`))
  expect(activityOf(toolTitle('x'.repeat(300)))[0]?.length).toBeLessThanOrEqual(120)
  const placeholder = line({ t: 't', dir: 'in', msg: { method: 'session/update', params: { update: { sessionUpdate: 'tool_call', title: 'Terminal' } } } })
  expect(activityOf([placeholder, toolTitle('cd /w/t && bun test /w/t/a.ts')].join('\n'), '/w/t')).toEqual(['bun test ./a.ts'])
})

test('TreeDetail D4 the drawn keys skip a folded issue\'s runs, and a single arrow walks them', () => {
  const groups: TreeGroup[] = [
    { issue: 'I', runs: [row('a', 'I'), row('b', 'I')] },
    { issue: null, runs: [row('c', null)] },
  ]
  expect(drawnKeys(groups, [])).toEqual([issueKey('I'), runKey('a'), runKey('b'), issueKey(null), runKey('c')])
  const keys = drawnKeys(groups, [issueKey('I')])
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
    [`${RUN}/events.jsonl`]: [toolTitle('bun test'), toolTitle('git commit')].join('\n'),
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
    activity: ['bun test', 'git commit'],
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
    [`${RUNS}/a/events.jsonl`]: toolTitle('bun test hooks'),
    [`${RUNS}/c/meta.json`]: meta(),
    [`${RUNS}/c/phase.json`]: line({ phase: 'running', title: 'Probe C' }),
  },
}

async function openPane($: any, on: any) {
  const w = kitWorld(on, PANE_WORLD)
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
  const files = { [`${runDir}/events.jsonl`]: toolTitle('one') }
  const engine = fakeEngine({ dirs: { [runDir]: [events] }, files })
  expect((await readDetail(engine.$, name))?.activity).toEqual(['one'])
  expect((await readDetail(engine.$, name))?.activity).toEqual(['one'])
  expect(engine.tails).toHaveLength(1)
  const grown = fakeEngine({ dirs: { [runDir]: [{ ...events, size: 20 }] }, files: { [`${runDir}/events.jsonl`]: [toolTitle('one'), toolTitle('two')].join('\n') } })
  expect((await readDetail(grown.$, name))?.activity).toEqual(['one', 'two'])
})

test('TreeDetail D6 pressing an issue folds its runs away and pressing it again brings them back', async ($, on) => {
  await openPane($, on)
  expect(stringsIn(await $.ui.render(PANE)).join(' ')).toContain('Build A')
  await $.ui.press({ plugin: 'muster', key: issueKey('https://example.com/I') })
  const folded = stringsIn(await $.ui.render(PANE)).join(' ')
  expect(folded).not.toContain('Build A')
  expect(folded).toContain('▸')
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
  expect(shown).toContain('bun test hooks')
  await $.ui.press({ plugin: 'muster', key: runKey('a') })
  expect(stringsIn(await $.ui.render(PANE)).join(' ')).not.toContain('the fixture is missing')
})
