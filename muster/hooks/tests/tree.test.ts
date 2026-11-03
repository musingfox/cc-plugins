import { expect, test } from 'claude-code/testing'
import { readRuns } from '../board.ts'
import { groupByIssue, treeStateLabel } from '../tree-model.ts'
import { stringsIn } from './fixtures/band.ts'
import { NOW, RUNS, SESSION, dir, fakeEngine, kitWorld } from './fixtures/world.ts'
import type { RunRow } from '../../types/index.d.ts'

const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()
const meta = (extra: object = {}, repoRoot = '/r', started = ago(100)) => JSON.stringify({ name: 'x', repoRoot, started, ...extra })
const phase = (value: object) => JSON.stringify(value)

const PANE = {
  component: 'Pane',
  surface: 'terminal',
  requestId: 'muster-tree',
  viewport: { columns: 160, rows: 40 },
  props: { title: 'muster', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

const row = (name: string, extra: Partial<RunRow> = {}): RunRow => ({
  name,
  state: 'running',
  title: 't',
  plan: null,
  tools: 0,
  cost: null,
  seconds: 10,
  issue: null,
  exitReason: null,
  ...extra,
})

// a runs under issue I; b is done under I; c exited on the idle timeout with no issue; d belongs to another repository.
const WORLD = {
  dirs: { [RUNS]: [dir('a'), dir('b'), dir('c'), dir('d')], [`${RUNS}/a`]: [], [`${RUNS}/b`]: [], [`${RUNS}/c`]: [], [`${RUNS}/d`]: [] },
  files: {
    [`${RUNS}/a/meta.json`]: meta({ issue: 'https://example.com/I' }, '/r', ago(50)),
    [`${RUNS}/a/phase.json`]: phase({ phase: 'running', title: 'Build A' }),
    [`${RUNS}/b/meta.json`]: meta({ issue: 'https://example.com/I' }, '/r', ago(200)),
    [`${RUNS}/b/phase.json`]: phase({ phase: 'idle', title: 'Build B' }),
    [`${RUNS}/b/REPORT.md`]: 'DONE\nok',
    [`${RUNS}/c/meta.json`]: meta(),
    [`${RUNS}/c/phase.json`]: phase({ phase: 'exited', reason: 'idle-timeout', title: 'Probe C' }),
    [`${RUNS}/d/meta.json`]: meta({ issue: 'https://example.com/I' }, '/other'),
    [`${RUNS}/d/phase.json`]: phase({ phase: 'running' }),
  },
}

test('DispatchTree T1 every run of this repository is read whatever its state, with its issue and exit reason', async () => {
  const runs = await readRuns(fakeEngine(WORLD).$)
  expect(runs?.map((run) => [run.name, run.state, run.issue, run.exitReason])).toEqual([
    ['a', 'running', 'https://example.com/I', null],
    ['b', 'done', 'https://example.com/I', null],
    ['c', 'exited', null, 'idle-timeout'],
  ])
  expect(await readRuns(fakeEngine({ dirs: { [RUNS]: { deny: 'EACCES' } } }).$)).toBeNull()
})

test('DispatchTree T2 runs group by issue, issues sorted with the no-issue group last, oldest run first', () => {
  const groups = groupByIssue([
    row('n1'),
    row('z1', { issue: 'zeta', seconds: 5 }),
    row('a1', { issue: 'alpha', seconds: 5 }),
    row('a2', { issue: 'alpha', seconds: 50 }),
  ])
  expect(groups.map((group) => [group.issue, group.runs.map((run) => run.name)])).toEqual([
    ['alpha', ['a2', 'a1']],
    ['zeta', ['z1']],
    [null, ['n1']],
  ])
  expect(groupByIssue([])).toEqual([])
})

test('DispatchTree T3 an exited run is labelled with its exit reason; other states keep the band label', () => {
  expect(treeStateLabel({ state: 'exited', exitReason: 'idle-timeout' })).toBe('exited · idle-timeout')
  expect(treeStateLabel({ state: 'exited', exitReason: null })).toBe('exited')
  expect(treeStateLabel({ state: 'question', exitReason: null })).toBe('? question')
  expect(treeStateLabel({ state: 'done', exitReason: null })).toBe('done')
})

test('DispatchTree T4 /muster-runs opens the pane, which lists this repository\'s runs under their issues', async ($, on) => {
  const w = kitWorld(on, WORLD)
  const opened: unknown[] = []
  on('command.register', () => ({ value: { command: 'muster-runs' } }))
  on('ui.open', (_: any, e: any) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  await $.session.start(SESSION)
  await w.clock.settle()
  const ran = await $.command.run({ command: 'muster-runs', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(opened).toContain('muster-tree')
  expect(JSON.stringify(ran)).toContain('opened')
  const text = stringsIn(await $.ui.render(PANE))
  const joined = text.join(' | ')
  expect(joined).toContain('https://example.com/I')
  expect(joined).toContain('(no issue)')
  expect(text.indexOf('https://example.com/I')).toBeLessThan(text.indexOf('b'))
  expect(text.indexOf('b')).toBeLessThan(text.indexOf('a'))
  expect(text.indexOf('a')).toBeLessThan(text.indexOf('(no issue)'))
  expect(joined).toContain('exited · idle-timeout')
  expect(joined).toContain('done')
  expect(joined).not.toContain('/other')
})

test('DispatchTree T5 with no runs the pane says so instead of drawing an empty tree', async ($, on) => {
  const w = kitWorld(on, { dirs: { [RUNS]: [] } })
  await $.session.start(SESSION)
  await w.clock.settle()
  expect(stringsIn(await $.ui.render(PANE)).join(' ')).toContain('No muster runs in this repository.')
})
