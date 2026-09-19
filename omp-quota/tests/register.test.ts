import { describe, expect, test } from 'claude-code/testing'
import { BAND } from './fixtures/band.ts'
import { FIXTURE, NOW, SESSION, fixtureWith, world } from './fixtures/world.ts'

function stringsIn(node: any): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  return [...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(stringsIn)
}

const BENEATH = { type: 'Text', children: ['beneath'] }

function beneath(on: any) {
  on('ui.render', { component: 'AbovePrompt' }, () => BENEATH)
}

function linesOf(tree: any): string[] {
  return (tree.props?.children ?? tree.children).map((line: any) => stringsIn(line).join(''))
}

// Each provider's name and share: the part of a band line that does not move with the clock.
function sharesOf(lines: string[]) {
  return lines.map((line) => line.split('  ')[0])
}

const BAND_LINES = [
  'openai-codex 6%  7 days 6% warning  resets 1d 11h',
  'ollama-cloud —  no limits reported',
  'google-antigravity 100%  Gemini · Weekly 100% ok  resets 6d 23h',
  'xai-oauth 100%  SuperGrok Weekly Credits · Weekly 100% ok  resets 6d 5h',
  'cursor 0%  Cursor Models · Monthly 0% exhausted  resets 11h 25m',
  'anthropic 86%  Claude 5 Hour · 5 Hour 86% ok  resets 1h 44m',
]

test('session start passes through to the engine', async ($, on) => {
  world(on)
  expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
})

test('never draws a status line, through a good fetch, a failed one, and a refresh', async ($, on) => {
  const w = world(on)
  w.omp(FIXTURE, { exitCode: 1 })
  await $.session.start(SESSION)
  await w.clock.settle()
  await w.clock.advance(300000)
  await $.command.run({ command: 'quota', args: 'refresh' })
  expect(w.jsonRuns()).toBe(3)
  expect(w.statuses).toEqual([])
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

  test('without HOME, omp is not run and the band says why', async ($, on) => {
    const w = world(on, { env: {}, store: { band: true } })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(w.runs).toEqual([])
    expect(linesOf(await $.ui.render(BAND))).toEqual(['Unavailable: HOME is unset'])
  })
})

describe('held figures', () => {
  test('a second session start keeps the held figures while omp is still running', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(FIXTURE, 'hang')
    await $.session.start(SESSION)
    await w.clock.settle()
    await $.session.start(SESSION)
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
    await w.clock.advance(60000)
  })

  test('an empty report list keeps the last figures and marks them stale', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(FIXTURE, { exitCode: 0, stdout: '{"reports":[]}' })
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    const lines = linesOf(await $.ui.render(BAND))
    expect(lines[0]).toBe('Stale: omp reported no providers; showing data from 5m ago')
    expect(sharesOf(lines.slice(1))).toEqual(sharesOf(BAND_LINES))
  })

  test('a non-zero exit keeps the last figures and marks them stale', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(FIXTURE, { exitCode: 1, stdout: '', stderr: 'boom' })
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    const lines = linesOf(await $.ui.render(BAND))
    expect(lines[0]).toBe('Stale: omp exited 1; showing data from 5m ago')
    expect(sharesOf(lines.slice(1))).toEqual(sharesOf(BAND_LINES))
  })

  test('a good fetch after a failed one clears the stale mark', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(FIXTURE, { exitCode: 1, stdout: '', stderr: 'boom' }, FIXTURE)
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    await w.clock.advance(300000)
    const lines = linesOf(await $.ui.render(BAND))
    expect(sharesOf(lines)).toEqual(sharesOf(BAND_LINES))
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

  test('a refused /quota registration leaves the poll working', async ($, on) => {
    const w = world(on, { commandRegister: () => ({ deny: 'taken' }) })
    expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
    await w.clock.settle()
    expect(w.jsonRuns()).toBe(1)
    await w.clock.advance(300000)
    expect(w.jsonRuns()).toBe(2)
  })
})

describe('fetch never blocks', () => {
  test('session start returns while omp is still running', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp('hang')
    expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
    expect(await w.clock.now()).toBe(NOW)
    expect(linesOf(await $.ui.render(BAND))).toEqual(['Fetching omp usage'])
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

describe('overlapping fetches', () => {
  function codexAt(remainingFraction: number) {
    const copy = JSON.parse(FIXTURE.stdout)
    copy.reports[0].limits[1].amount.remainingFraction = remainingFraction
    return { exitCode: 0, stdout: JSON.stringify(copy), stderr: '' }
  }

  test('a poll that settles after a refresh leaves the refreshed figures alone', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(FIXTURE, 'hang', codexAt(0.5))
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    expect(await $.command.run({ command: 'quota', args: 'refresh' })).toEqual({ text: 'omp quota refreshed' })
    const refreshed = linesOf(await $.ui.render(BAND))
    expect(refreshed[0]).toStartWith('openai-codex 50%  7 days 50% warning')
    const invalidates = w.invalidates
    await w.clock.advance(60000)
    expect(linesOf(await $.ui.render(BAND))[0]).toBe(refreshed[0])
    expect(w.invalidates).toBe(invalidates)
  })

  test('two fetches settling together raise one toast for the same worsening', async ($, on) => {
    const w = world(on)
    w.omp(fixtureWith({ 'openai-codex:secondary': 'ok' }), FIXTURE)
    await $.session.start(SESSION)
    await w.clock.settle()
    await Promise.all([$.session.start(SESSION), $.session.start(SESSION)])
    await w.clock.settle()
    expect(w.toasts).toEqual(['omp quota: openai-codex now warning'])
  })
})

describe('/quota', () => {
  test('session start registers the command', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(w.registered).toEqual([
      { name: 'quota', description: 'Show omp provider quota', argumentHint: '[refresh]', immediate: true },
    ])
  })

  test('toggles the band on, then off, answering nothing and asking for a redraw each time', async ($, on) => {
    const w = world(on)
    beneath(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    const before = w.invalidates
    expect(await $.command.run({ command: 'quota' })).toEqual({})
    expect(w.invalidates).toBe(before + 1)
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
    expect(await $.command.run({ command: 'quota' })).toEqual({})
    expect(w.invalidates).toBe(before + 2)
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
  })

  test('only the command shows the band, never a poll or a worsening', async ($, on) => {
    const w = world(on)
    beneath(on)
    w.omp(fixtureWith({ 'openai-codex:secondary': 'ok' }), FIXTURE)
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(600000)
    expect(w.toasts).toHaveLength(1)
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
  })

  test('other arguments answer the usage line and run nothing', async ($, on) => {
    const w = world(on)
    beneath(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    const runs = w.runs.length
    expect(await $.command.run({ command: 'quota', args: 'junk' })).toEqual({ text: 'usage: /quota [refresh]' })
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
    expect(w.runs).toHaveLength(runs)
  })

  test('a store that refuses still toggles the band', async ($, on) => {
    const w = world(on, { store: 'refuse' })
    beneath(on)
    expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
    await w.clock.settle()
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
    expect(await $.command.run({ command: 'quota' })).toEqual({})
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
  })
})

describe('/quota refresh', () => {
  test("drops omp's cache, then refetches, both against the user's omp home", async ($, on) => {
    const w = world(on)
    beneath(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(await $.command.run({ command: 'quota', args: 'refresh' })).toEqual({ text: 'omp quota refreshed' })
    const [invalidate, fetch] = w.runs.slice(-2)
    expect(invalidate.argv).toEqual(['omp', 'usage', 'invalidate'])
    expect(fetch.argv).toEqual(['omp', 'usage', '--json'])
    expect(invalidate.init.env.PI_CODING_AGENT_DIR).toBe('/home/u/.omp/agent')
    expect(fetch.init.env.PI_CODING_AGENT_DIR).toBe('/home/u/.omp/agent')
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
  })

  test('a failed refetch answers the reason and marks the band stale', async ($, on) => {
    const w = world(on, { store: { band: true } })
    await $.session.start(SESSION)
    await w.clock.settle()
    w.omp({ exitCode: 0, stdout: '{"reports":[]}' })
    expect(await $.command.run({ command: 'quota', args: 'refresh' })).toEqual({
      text: 'omp quota refresh failed: omp reported no providers',
    })
    expect(linesOf(await $.ui.render(BAND))[0]).toBe('Stale: omp reported no providers; showing data from 0m ago')
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

describe('quota band', () => {
  test('a band left on in an earlier session draws from the start', async ($, on) => {
    const w = world(on, { store: { band: true } })
    beneath(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
  })

  test('a toggle is remembered by the next session start', async ($, on) => {
    const w = world(on)
    beneath(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    await $.command.run({ command: 'quota' })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
    await $.command.run({ command: 'quota' })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
  })

  test('a store that refuses at session start leaves the band off', async ($, on) => {
    const w = world(on, { store: 'refuse' })
    beneath(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
  })

  test('yields to a survey holding the band', async ($, on) => {
    const w = world(on, { store: { band: true } })
    beneath(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(await $.ui.render({ ...BAND, props: { ...BAND.props, hasSurvey: true } })).toEqual(BENEATH)
  })

  test('draws one truncating line per provider in omp order, under a dim stale notice', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(FIXTURE, { exitCode: 1 })
    await $.session.start(SESSION)
    await w.clock.settle()
    await $.command.run({ command: 'quota', args: 'refresh' })
    const tree: any = await $.ui.render(BAND)
    expect(linesOf(tree)).toEqual(['Stale: omp exited 1; showing data from 0m ago', ...BAND_LINES])
    const lines = tree.props?.children ?? tree.children
    expect(lines.map((line: any) => line.props.wrap)).toEqual(Array(7).fill('truncate-end'))
    expect(lines[0].props.dimColor).toBe(true)
  })

  test('colors each share by how much is left, leaving a missing share plain', async ($, on) => {
    const w = world(on, { store: { band: true } })
    await $.session.start(SESSION)
    await w.clock.settle()
    const tree: any = await $.ui.render(BAND)
    const lines = tree.props?.children ?? tree.children
    const colored = (line: any) =>
      (line.props?.children ?? line.children)
        .filter((span: any) => span?.props?.color)
        .map((span: any) => [stringsIn(span).join(''), span.props.color])
    expect(colored(lines[0])).toEqual([
      ['6%', '#e5484d'],
      ['6%', '#e5484d'],
    ])
    expect(colored(lines[1])).toEqual([])
    expect(colored(lines[5])).toEqual([
      ['86%', '#46a758'],
      ['86%', '#46a758'],
    ])
    expect(lines.map((line: any) => line.props.wrap)).toEqual(Array(6).fill('truncate-end'))
  })

  test('a lowest limit without a status shows a dash in its place', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(fixtureWith({ 'openai-codex:secondary': undefined }))
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(linesOf(await $.ui.render(BAND))[0]).toBe('openai-codex 6%  7 days 6% —  resets 1d 11h')
  })

  test('says it is fetching while omp has not answered', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp('hang')
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(linesOf(await $.ui.render(BAND))).toEqual(['Fetching omp usage'])
    await w.clock.advance(60000)
  })

  test('names the failure when no fetch has succeeded', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp({ deny: 'timed out' })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(linesOf(await $.ui.render(BAND))).toEqual(['Unavailable: omp did not answer'])
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

  test("omp's account data never reaches a toast, the transcript, or the band", async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(planted({ 'openai-codex:secondary': 'ok' }), planted())
    await $.session.start(SESSION)
    await w.clock.settle()
    const answer = await $.command.run({ command: 'quota', args: 'refresh' })
    const band = stringsIn(await $.ui.render(BAND))
    expect(w.toasts).toHaveLength(1)
    expect(band).not.toEqual([])
    const shown = [...w.toasts, answer.text, ...band]
    expect(shown.filter((text) => text.includes('planted'))).toEqual([])
  })

  test("omp's error output never reaches a toast, the transcript, or the band", async ($, on) => {
    const w = world(on, { store: { band: true } })
    const failing = { exitCode: 1, stdout: '', stderr: 'Bearer sk-planted' }
    w.omp(planted(), failing)
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    const answer = await $.command.run({ command: 'quota', args: 'refresh' })
    const tree = await $.ui.render(BAND)
    const band = stringsIn(tree)
    expect(band).not.toEqual([])
    const shown = [...w.toasts, answer.text, ...band]
    expect(shown.filter((text) => text.includes('sk-planted'))).toEqual([])
    expect(linesOf(tree)[0]).toBe('Stale: omp exited 1; showing data from 5m ago')
    expect(answer).toEqual({ text: 'omp quota refresh failed: omp exited 1' })
  })
})
