import { expect, test } from 'claude-code/testing'
import { NOW, RUNS, SESSION, dir, kitWorld } from './fixtures/world.ts'

const meta = (name: string) => JSON.stringify({ name, repoRoot: '/r', started: new Date(NOW - 10_000).toISOString() })
const phase = (value: string) => JSON.stringify({ phase: value, title: 'Build it' })

// Runs listed in `names` start in `state`; `w.add` lists another one later, as a dispatch would.
function world(on: any, names: string[], state = 'running') {
  const opens: { id: string; focus?: boolean }[] = []
  on('ui.open', (_: any, e: any) => {
    opens.push({ id: e.id, focus: e.focus })
    return { value: { isPlaced: true } }
  })
  const dirs: Record<string, any> = { [RUNS]: names.map(dir) }
  const files: Record<string, string> = {}
  const put = (name: string, value: string) => {
    dirs[`${RUNS}/${name}`] = []
    files[`${RUNS}/${name}/meta.json`] = meta(name)
    files[`${RUNS}/${name}/phase.json`] = phase(value)
  }
  for (const name of names) put(name, state)
  const w = kitWorld(on, { dirs, files })
  const add = (name: string, value = 'running') => {
    put(name, value)
    ;(dirs[RUNS] as any[]).push(dir(name))
  }
  const tick = async () => {
    await w.clock.advance(5000)
    await w.clock.settle()
  }
  return { ...w, opens, add, tick }
}

test('AutoOpen T1 runs already listed at session start open no pane', async ($, on) => {
  const w = world(on, ['old'])
  await $.session.start(SESSION)
  await w.clock.settle()
  await w.tick()
  expect(w.opens).toEqual([])
})

test('AutoOpen T2 a run that appears in flight opens the pane once, without taking the keyboard', async ($, on) => {
  const w = world(on, [])
  await $.session.start(SESSION)
  await w.clock.settle()
  w.add('fresh')
  await w.tick()
  await w.tick()
  expect(w.opens.map((open) => open.id)).toEqual(['muster-tree'])
  expect(w.opens[0]?.focus).not.toBe(true)
})

test('AutoOpen T3 a run that appears already finished opens no pane', async ($, on) => {
  const w = world(on, [])
  await $.session.start(SESSION)
  await w.clock.settle()
  w.add('late', 'done')
  await w.tick()
  expect(w.opens).toEqual([])
})

test('AutoOpen T4 each later new run opens the pane again', async ($, on) => {
  const w = world(on, [])
  await $.session.start(SESSION)
  await w.clock.settle()
  w.add('one')
  await w.tick()
  w.add('two')
  await w.tick()
  expect(w.opens.map((open) => open.id)).toEqual(['muster-tree', 'muster-tree'])
})
