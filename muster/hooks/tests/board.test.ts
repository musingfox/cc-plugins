import { expect, test } from 'claude-code/testing'
import { readBoard } from '../board.ts'
import { NOW, RUNS, dir, file, fakeEngine } from './fixtures/world.ts'

const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()
const meta = (repoRoot: unknown, started: unknown = ago(100)) => JSON.stringify({ name: 'x', repoRoot, started })
const phase = (value: object) => JSON.stringify(value)
const RUN_A = `${RUNS}/a`

test('RepoScopedBoard T1 only this repository is read past its meta, and its row carries the figures', async () => {
  const { $, reads } = fakeEngine({
    dirs: { [RUNS]: [dir('a'), dir('b')], [RUN_A]: [file('meta.json'), file('phase.json')] },
    files: {
      [`${RUNS}/a/meta.json`]: meta('/r'),
      [`${RUNS}/a/phase.json`]: phase({ phase: 'running', plan: { done: 1, total: 3 } }),
      [`${RUNS}/b/meta.json`]: meta('/other'),
      [`${RUNS}/b/phase.json`]: phase({ phase: 'running' }),
    },
  })
  expect(await readBoard($)).toEqual({
    rows: [{ name: 'a', state: 'running', title: '(no title yet)', plan: { done: 1, total: 3 }, tools: 0, cost: null, seconds: 100 }],
    collect: 0,
  })
  expect(reads.filter((path) => path.startsWith(`${RUNS}/b/`))).toEqual([`${RUNS}/b/meta.json`])
})

test('RepoScopedBoard T2 a trailing slash on either side does not stop a match', async () => {
  const forward = fakeEngine({ root: '/r/', dirs: { [RUNS]: [dir('a')], [RUN_A]: [] }, files: { [`${RUN_A}/meta.json`]: meta('/r'), [`${RUN_A}/phase.json`]: phase({ phase: 'idle' }) } })
  expect((await readBoard(forward.$))?.rows.map((row) => row.name)).toEqual(['a'])
  const reverse = fakeEngine({ root: '/r', dirs: { [RUNS]: [dir('a')], [RUN_A]: [] }, files: { [`${RUN_A}/meta.json`]: meta('/r/'), [`${RUN_A}/phase.json`]: phase({ phase: 'idle' }) } })
  expect((await readBoard(reverse.$))?.rows.map((row) => row.name)).toEqual(['a'])
})

// a runs; b finished with DONE; c blocked and exited; d with a malformed report.
const FINISHED = {
  dirs: { [RUNS]: [dir('a'), dir('b'), dir('c'), dir('d')], [RUN_A]: [], [`${RUNS}/b`]: [], [`${RUNS}/c`]: [], [`${RUNS}/d`]: [] },
  files: {
    [`${RUN_A}/meta.json`]: meta('/r'),
    [`${RUN_A}/phase.json`]: phase({ phase: 'running' }),
    [`${RUNS}/b/meta.json`]: meta('/r'),
    [`${RUNS}/b/phase.json`]: phase({ phase: 'idle' }),
    [`${RUNS}/b/REPORT.md`]: 'DONE\nall good',
    [`${RUNS}/c/meta.json`]: meta('/r'),
    [`${RUNS}/c/phase.json`]: phase({ phase: 'exited' }),
    [`${RUNS}/c/REPORT.md`]: 'BLOCKED',
    [`${RUNS}/d/meta.json`]: meta('/r'),
    [`${RUNS}/d/phase.json`]: phase({ phase: 'running' }),
    [`${RUNS}/d/REPORT.md`]: 'oops',
  },
}

test('RepoScopedBoard T3 the header counts finished runs to collect, and only the live run is a row', async () => {
  const { $ } = fakeEngine(FINISHED)
  const board = await readBoard($)
  expect(board?.rows.map((row) => row.name)).toEqual(['a'])
  expect(board?.collect).toBe(3)
})

test('RepoScopedBoard T4 with no run in flight, or no runs directory, or no listing the board is null', async () => {
  const onlyFinished = fakeEngine({ dirs: FINISHED.dirs, files: { ...FINISHED.files, [`${RUN_A}/phase.json`]: phase({ phase: 'exited' }) } })
  expect(await readBoard(onlyFinished.$)).toBeNull()
  expect(await readBoard(fakeEngine({ dirs: { [RUNS]: [] } }).$)).toBeNull()
  expect(await readBoard(fakeEngine({ dirs: { [RUNS]: { deny: 'EACCES' } } }).$)).toBeNull()
})

test('RepoScopedBoard T5 a run that cannot be read is skipped and the others still show', async () => {
  const { $ } = fakeEngine({
    dirs: { [RUNS]: [dir('a'), dir('b'), dir('c'), dir('d'), dir('e'), dir('f')], [RUN_A]: [], [`${RUNS}/f`]: [] },
    files: {
      [`${RUN_A}/meta.json`]: meta('/r'),
      [`${RUN_A}/phase.json`]: phase({ phase: 'running' }),
      [`${RUNS}/b/meta.json`]: meta('/r'),
      [`${RUNS}/c/meta.json`]: 'not json',
      [`${RUNS}/d/meta.json`]: meta('/r', 'junk'),
      [`${RUNS}/e/meta.json`]: meta(7),
      [`${RUNS}/f/meta.json`]: meta('/r'),
      [`${RUNS}/f/phase.json`]: phase({ phase: 'running' }),
    },
  });
  expect((await readBoard($))?.rows.map((row) => row.name)).toEqual(['a', 'f'])
})

test('RepoScopedBoard T6 only directories under the runs directory are runs', async () => {
  const { $, reads } = fakeEngine({
    dirs: { [RUNS]: [file('notes.txt'), { name: 'link', kind: 'other', size: 0, mtimeMs: 0, isLink: true }, dir('a')], [RUN_A]: [] },
    files: { [`${RUN_A}/meta.json`]: meta('/r'), [`${RUN_A}/phase.json`]: phase({ phase: 'running' }) },
  })
  expect((await readBoard($))?.rows.map((row) => row.name)).toEqual(['a'])
  expect(reads.some((path) => path.includes('notes.txt') || path.includes('link'))).toBe(false)
})

test('RepoScopedBoard T7 an unreadable report leaves the state to the phase and no events log is ever read', async () => {
  const { $, reads } = fakeEngine({
    dirs: { [RUNS]: [dir('a')], [RUN_A]: [] },
    files: { [`${RUN_A}/meta.json`]: meta('/r'), [`${RUN_A}/phase.json`]: phase({ phase: 'running' }), [`${RUN_A}/REPORT.md`]: { deny: 'EACCES' } },
  })
  expect((await readBoard($))?.rows.map((row) => row.state)).toEqual(['running'])
  expect(reads.some((path) => path.endsWith('events.jsonl'))).toBe(false)
})

test('RepoScopedBoard T8 a symlinked path of the same repository is not matched by basename', async () => {
  const { $ } = fakeEngine({
    root: '/private/tmp/x',
    dirs: { [RUNS]: [dir('a')], [RUN_A]: [] },
    files: { [`${RUN_A}/meta.json`]: meta('/tmp/x'), [`${RUN_A}/phase.json`]: phase({ phase: 'running' }) },
  })
  expect(await readBoard($)).toBeNull()
})

test('RunsRootResolution T1 to T4 the listing goes to the runs directory the environment names, and nowhere else', async () => {
  const listed = (env: Record<string, string>) => {
    const engine = fakeEngine({ env })
    return readBoard(engine.$).then(() => engine.lists)
  }
  expect(await listed({ MUSTER_HOME: '/data/m', HOME: '/home/u' })).toEqual(['/data/m/runs'])
  expect(await listed({ HOME: '/home/u' })).toEqual(['/home/u/.cache/muster/runs'])
  expect(await listed({ MUSTER_HOME: '', HOME: '/home/u' })).toEqual(['/home/u/.cache/muster/runs'])
  expect(await listed({})).toEqual([])
})
