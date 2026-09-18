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
