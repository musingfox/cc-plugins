import { describe, expect, test } from 'claude-code/testing'
import { PANE } from './fixtures/pane.ts'
import { FIXTURE, NOW, SESSION, fixtureWith, world } from './fixtures/world.ts'

const SUCCESS =
  'omp quota: openai-codex 6% · ollama-cloud — · google-antigravity 100% · xai-oauth 100% · cursor 0% · anthropic 86%'

function stringsIn(node: any): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  return [...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(stringsIn)
}

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

describe('fetch never blocks', () => {
  test('session start returns while omp is still running', async ($, on) => {
    const w = world(on)
    w.omp('hang')
    expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
    expect(await w.clock.now()).toBe(NOW)
    expect(w.statuses).toEqual(['omp quota: fetching'])
    await w.clock.advance(60000)
  })
})

describe('worsening toast', () => {
  const CODEX_OK = fixtureWith({ 'openai-codex:secondary': 'ok' })

  test('the first good fetch raises no toast even with providers already bad', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(w.toasts).toEqual([])
  })

  test('a provider going from ok to warning raises one toast, and only once', async ($, on) => {
    const w = world(on)
    w.omp(CODEX_OK, FIXTURE)
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    expect(w.toasts).toEqual(['omp quota: openai-codex now warning'])
    await w.clock.advance(300000)
    expect(w.toasts).toHaveLength(1)
  })

  test('a failed fetch in between does not reset the comparison', async ($, on) => {
    const w = world(on)
    w.omp(CODEX_OK, { exitCode: 1 }, FIXTURE)
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    await w.clock.advance(300000)
    expect(w.toasts).toEqual(['omp quota: openai-codex now warning'])
  })

  test('several providers worsening at once share one toast', async ($, on) => {
    const w = world(on)
    w.omp(CODEX_OK, fixtureWith({ 'anthropic:5h': 'exhausted' }))
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    expect(w.toasts).toEqual(['omp quota: openai-codex now warning, anthropic now exhausted'])
  })
})

describe('/quota', () => {
  const PANE = { id: 'omp-quota', title: 'omp quota', focus: true, closeOnEscape: true }

  test('session start registers the command', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(w.registered).toEqual([
      { name: 'quota', description: 'Show omp provider quota', argumentHint: '[refresh]', immediate: true },
    ])
  })

  test('only the command opens the pane, never a poll or a worsening', async ($, on) => {
    const w = world(on)
    w.omp(fixtureWith({ 'openai-codex:secondary': 'ok' }), FIXTURE)
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(600000)
    expect(w.toasts).toHaveLength(1)
    expect(w.opened).toEqual([])
    expect(await $.command.run({ command: 'quota' })).toEqual({})
    expect(w.opened).toEqual([PANE])
  })

  test('other arguments answer the usage line and run nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    const runs = w.runs.length
    expect(await $.command.run({ command: 'quota', args: 'junk' })).toEqual({ text: 'usage: /quota [refresh]' })
    expect(w.opened).toEqual([])
    expect(w.runs).toHaveLength(runs)
  })

  test('a refused pane answers one transcript line', async ($, on) => {
    const w = world(on, { uiOpen: () => ({ deny: 'no' }) })
    await $.session.start(SESSION)
    expect(await $.command.run({ command: 'quota' })).toEqual({ text: 'omp quota: the pane could not open' })
  })
})

describe('/quota refresh', () => {
  test("drops omp's cache, then refetches, both against the user's omp home", async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(await $.command.run({ command: 'quota', args: 'refresh' })).toEqual({ text: 'omp quota refreshed' })
    const [invalidate, fetch] = w.runs.slice(-2)
    expect(invalidate.argv).toEqual(['omp', 'usage', 'invalidate'])
    expect(fetch.argv).toEqual(['omp', 'usage', '--json'])
    expect(invalidate.init.env.PI_CODING_AGENT_DIR).toBe('/home/u/.omp/agent')
    expect(fetch.init.env.PI_CODING_AGENT_DIR).toBe('/home/u/.omp/agent')
    expect(w.opened).toEqual([])
  })

  test('a failed refetch answers the reason and marks the status line stale', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    w.omp({ exitCode: 0, stdout: '{"reports":[]}' })
    expect(await $.command.run({ command: 'quota', args: 'refresh' })).toEqual({
      text: 'omp quota refresh failed: omp reported no providers',
    })
    expect(last(w.statuses)).toEndWith(' (stale)')
  })

  test('a failed invalidate still refetches and says the cache was kept', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    w.invalidateAnswers({ exitCode: 2 })
    const before = w.jsonRuns()
    expect(await $.command.run({ command: 'quota', args: 'refresh' })).toEqual({
      text: 'omp quota refreshed (cache not invalidated)',
    })
    expect(w.jsonRuns()).toBe(before + 1)
  })
})

describe('quota pane', () => {
  test('draws every provider section and row from the latest data', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    const strings = stringsIn(await $.ui.render(PANE))
    expect(strings).toContain('openai-codex 6%')
    expect(strings).toContain('Claude & GPT (shared) · Weekly [anthropic]')
    expect(strings).toContain('1d 11h')
    expect(strings).toContain('no limits reported')
  })

  test('says it is fetching while omp has not answered', async ($, on) => {
    const w = world(on)
    w.omp('hang')
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(stringsIn(await $.ui.render(PANE))).toContain('Fetching omp usage')
    await w.clock.advance(60000)
  })

  test('names the failure when no fetch has succeeded', async ($, on) => {
    const w = world(on)
    w.omp({ deny: 'timed out' })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(stringsIn(await $.ui.render(PANE))).toContain('Unavailable: omp did not answer')
  })

  test("leaves another plugin's pane to the hook beneath", async ($, on) => {
    world(on)
    on('ui.render', { component: 'Pane' }, () => ({ type: 'Text', children: ['beneath'] }))
    await $.session.start(SESSION)
    expect(await $.ui.render({ ...PANE, requestId: 'other' })).toEqual({ type: 'Text', children: ['beneath'] })
  })

  test('asks for a redraw after every settled fetch, failed ones included', async ($, on) => {
    const w = world(on)
    w.omp(FIXTURE, { exitCode: 1 })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(w.invalidates).toBe(1)
    await w.clock.advance(300000)
    expect(w.invalidates).toBe(2)
  })
})

describe('account data', () => {
  // Built here, never in snapshot.ts: the fixture's own guard would flag it.
  function planted(statuses: Record<string, string | undefined> = {}) {
    const copy = JSON.parse(fixtureWith(statuses).stdout)
    for (const report of copy.reports) {
      report.metadata = { email: 'planted@example.test', accountId: 'acct-planted', endpoint: 'https://planted.example' }
      for (const limit of report.limits) limit.scope.projectId = 'proj-planted'
    }
    return { exitCode: 0, stdout: JSON.stringify(copy), stderr: '' }
  }

  test("omp's account data never reaches the status line, a toast, the transcript, or the pane", async ($, on) => {
    const w = world(on)
    w.omp(planted({ 'openai-codex:secondary': 'ok' }), planted())
    await $.session.start(SESSION)
    await w.clock.settle()
    const answer = await $.command.run({ command: 'quota', args: 'refresh' })
    const pane = stringsIn(await $.ui.render(PANE))
    expect(w.toasts).toHaveLength(1)
    const shown = [...w.statuses, ...w.toasts, answer.text, ...pane]
    expect(shown.filter((text) => text.includes('planted'))).toEqual([])
  })

  test("omp's error output never reaches the status line, the transcript, or the pane", async ($, on) => {
    const w = world(on)
    const failing = { exitCode: 1, stdout: '', stderr: 'Bearer sk-planted' }
    w.omp(planted(), failing)
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    const answer = await $.command.run({ command: 'quota', args: 'refresh' })
    const pane = stringsIn(await $.ui.render(PANE))
    const shown = [...w.statuses, ...w.toasts, answer.text, ...pane]
    expect(shown.filter((text) => text.includes('sk-planted'))).toEqual([])
    expect(last(w.statuses)).toEndWith(' (stale)')
    expect(answer).toEqual({ text: 'omp quota refresh failed: omp exited 1' })
  })
})
