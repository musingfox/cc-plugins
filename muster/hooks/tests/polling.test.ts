import { expect, test } from 'claude-code/testing'
import { BAND, stringsIn } from './fixtures/band.ts'
import { NOW, RUNS, SESSION, dir, file, kitWorld } from './fixtures/world.ts'

const RUN = `${RUNS}/inline-help`
const meta = JSON.stringify({ name: 'inline-help', repoRoot: '/r', started: new Date(NOW - 125_000).toISOString() })
const phase = (value: string) => JSON.stringify({ phase: value, title: 'Add a login form', plan: { done: 2, total: 5 } })
const world = (on: any, phaseValue = 'running', extra: object = {}) =>
  kitWorld(on, {
    dirs: { [RUNS]: [dir('inline-help')], [RUN]: [file('phase.json')] },
    files: { [`${RUN}/meta.json`]: meta, [`${RUN}/phase.json`]: phase(phaseValue) },
    ...extra,
  })
const rowText = async ($: any) => stringsIn(await $.ui.render(BAND)).join(' ')
const runListings = (w: { lists: string[] }) => w.lists.filter((path) => path === RUNS).length

test('BandPolling T1 the run is shown after session start, without advancing the clock', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  await w.clock.settle()
  expect(await rowText($)).toContain('inline-help')
  expect(await rowText($)).toContain('running')
  expect(w.clock.now()).toBe(NOW)
})

test('BandPolling T2 a phase change shows on the tick at five seconds, not before', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  await w.clock.settle()
  w.files[`${RUN}/phase.json`] = phase('idle')
  await w.clock.advance(4999)
  await w.clock.settle()
  expect(await rowText($)).toContain('running')
  await w.clock.advance(1)
  await w.clock.settle()
  expect(await rowText($)).toContain('idle')
})

test('BandPolling T3 two session starts leave one timer, so one tick lists the runs once', async ($, on) => {
  const w = world(on)
  await $.session.start(SESSION)
  await $.session.start(SESSION)
  await w.clock.settle()
  const before = runListings(w)
  await w.clock.advance(5000)
  await w.clock.settle()
  expect(runListings(w) - before).toBe(1)
})

test('BandPolling T4 a read that never settles does not hold the start, and a tick during it starts no second read', async ($, on) => {
  const w = world(on, 'running', { dirs: { [RUNS]: 'defer' } })
  await $.session.start(SESSION)
  await w.clock.settle()
  expect(runListings(w)).toBe(1)
  await w.clock.advance(5000)
  await w.clock.settle()
  expect(runListings(w)).toBe(1)
})

test('BandPolling T5 a root that is denied on a tick is retried on the next one', async ($, on) => {
  const w = world(on)
  w.state.rootDenied = true
  await $.session.start(SESSION)
  await w.clock.settle()
  await w.clock.advance(5000)
  await w.clock.settle()
  w.state.rootDenied = false
  await w.clock.advance(5000)
  await w.clock.settle()
  expect(await rowText($)).toContain('inline-help')
})
