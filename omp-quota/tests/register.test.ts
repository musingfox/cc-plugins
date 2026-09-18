import { describe, expect, test } from 'claude-code/testing'
import { SESSION, world } from './fixtures/world.ts'

test('session start passes through to the engine', async ($, on) => {
  world(on)
  expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
})

describe('omp invocation', () => {
  test("runs omp against the user's own omp home with a 10 s limit", async ($, on) => {
    const w = world(on, { env: { HOME: '/home/u', PI_CODING_AGENT_DIR: '/home/u/.pi/dispatch' } })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(w.runs[0].argv).toEqual(['omp', 'usage', '--json'])
    expect(w.runs[0].init.env).toEqual({ PI_CODING_AGENT_DIR: '/home/u/.omp/agent' })
    expect(w.runs[0].init.timeoutMs).toBe(10000)
  })

  test('without HOME, omp is not run and the status line says why', async ($, on) => {
    const w = world(on, { env: {} })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(w.runs).toEqual([])
    expect(w.statuses[w.statuses.length - 1]).toBe('omp quota: unavailable (HOME is unset)')
  })
})

describe('poll schedule', () => {
  test('fetches at session start, then every 5 minutes', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(w.jsonRuns()).toBe(1)
    await w.clock.advance(299999)
    expect(w.jsonRuns()).toBe(1)
    await w.clock.advance(1)
    expect(w.jsonRuns()).toBe(2)
    await w.clock.advance(300000)
    expect(w.jsonRuns()).toBe(3)
  })

  test('a second session start replaces the poll instead of doubling it', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(w.jsonRuns()).toBe(2)
    await w.clock.advance(300000)
    expect(w.jsonRuns()).toBe(3)
  })

  test('a failed fetch leaves the poll running', async ($, on) => {
    const w = world(on)
    w.omp({ deny: 'timed out' })
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    expect(w.jsonRuns()).toBe(2)
  })
})
