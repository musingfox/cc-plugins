import { describe, expect, test } from 'claude-code/testing'
import { FIXTURE, SESSION, world } from './fixtures/world.ts'

const SUCCESS =
  'omp quota: openai-codex 6% · ollama-cloud — · google-antigravity 100% · xai-oauth 100% · cursor 0% · anthropic 86%'

function last(list: string[]) {
  return list[list.length - 1]
}

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
    expect(last(w.statuses)).toBe('omp quota: unavailable (HOME is unset)')
  })
})

describe('status line', () => {
  test('reads fetching until the first fetch settles', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(w.statuses[0]).toBe('omp quota: fetching')
  })

  test("shows each provider's lowest remaining share once omp answers", async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(last(w.statuses)).toBe(SUCCESS)
  })

  test('an empty report list keeps the last figures and marks them stale', async ($, on) => {
    const w = world(on)
    w.omp(FIXTURE, { exitCode: 0, stdout: '{"reports":[]}' })
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    expect(last(w.statuses)).toBe(`${SUCCESS} (stale)`)
  })

  test('a non-zero exit keeps the last figures and marks them stale', async ($, on) => {
    const w = world(on)
    w.omp(FIXTURE, { exitCode: 1, stdout: '', stderr: 'boom' })
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    expect(last(w.statuses)).toBe(`${SUCCESS} (stale)`)
  })

  test('a good fetch after a failed one clears the stale mark', async ($, on) => {
    const w = world(on)
    w.omp(FIXTURE, { exitCode: 1, stdout: '', stderr: 'boom' }, FIXTURE)
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    await w.clock.advance(300000)
    expect(last(w.statuses)).toBe(SUCCESS)
  })

  test('with no good fetch yet the line names the failure', async ($, on) => {
    const w = world(on)
    w.omp({ deny: 'timed out' })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(last(w.statuses)).toBe('omp quota: unavailable (omp did not answer)')
  })

  test('a refused /quota registration does not stop the status line', async ($, on) => {
    const w = world(on, { commandRegister: () => ({ deny: 'taken' }) })
    expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
    await w.clock.settle()
    expect(last(w.statuses)).toBe(SUCCESS)
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
