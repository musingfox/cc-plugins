import type { On } from 'claude-code'
import { paneModelOf } from './pane-rows.ts'
import type { QuotaView } from './pane-rows.ts'
import { statusLineOf } from './status-line.ts'
import { readUsage, worsenedProviders } from './usage.ts'
import type { OmpOutcome, UsageReading } from './usage.ts'

const FETCH_ARGV = ['omp', 'usage', '--json']
const INVALIDATE_ARGV = ['omp', 'usage', 'invalidate']
const OMP_TIMEOUT_MS = 10_000
const POLL_MS = 300_000
const PANE_ID = 'omp-quota'

let view: QuotaView = { usage: null, failure: null, lastGoodAt: null }
let poll: { cancel(): void } | null = null

async function runOmp($: any, home: string, argv: string[]): Promise<OmpOutcome> {
  try {
    // No shell, so no `~`; and env can only override the PI_CODING_AGENT_DIR that
    // Claude Code's own settings pass down, never unset it.
    const result = await $.process.run(argv, {
      env: { PI_CODING_AGENT_DIR: `${home}/.omp/agent` },
      timeoutMs: OMP_TIMEOUT_MS,
    })
    return { kind: 'exited', exitCode: result.exitCode, stdout: result.stdout }
  } catch {
    return { kind: 'rejected' }
  }
}

async function fetchUsage($: any): Promise<UsageReading> {
  const home = await $.env.get('HOME')
  if (!home) return { ok: false, reason: 'HOME is unset' }
  return readUsage(await runOmp($, home, FETCH_ARGV))
}

async function publish($: any, reading: UsageReading) {
  if (reading.ok) {
    const worsened = worsenedProviders(view.usage, reading.usage)
    view = { usage: reading.usage, failure: null, lastGoodAt: await $.clock.now() }
    if (worsened.length) $.ui.toast(`omp quota: ${worsened.map((w) => `${w.provider} now ${w.status}`).join(', ')}`)
  } else {
    view = { ...view, failure: reading.reason }
  }
  $.ui.status(statusLineOf(view))
  $.ui.invalidate('ui.render')
}

async function fetchAndPublish($: any) {
  await publish($, await fetchUsage($))
}

async function refresh($: any) {
  const home = await $.env.get('HOME')
  if (!home) {
    await publish($, { ok: false, reason: 'HOME is unset' })
    return { text: 'omp quota refresh failed: HOME is unset' }
  }
  const invalidated = await runOmp($, home, INVALIDATE_ARGV)
  const reading = readUsage(await runOmp($, home, FETCH_ARGV))
  await publish($, reading)
  const note = invalidated.kind === 'exited' && invalidated.exitCode === 0 ? '' : ' (cache not invalidated)'
  return { text: reading.ok ? `omp quota refreshed${note}` : `omp quota refresh failed: ${reading.reason}${note}` }
}

async function openPane($: any) {
  try {
    await $.ui.open({ id: PANE_ID, title: 'omp quota', focus: true, closeOnEscape: true })
    return {}
  } catch {
    return { text: 'omp quota: the pane could not open' }
  }
}

async function renderPane($: any, e: any) {
  const { Box, Text } = await $.ui.resolve(e)
  const model = paneModelOf(view, await $.clock.now())
  const lines = []
  if (model.notice) lines.push(Text({ dimColor: true, children: [model.notice] }))
  for (const section of model.providers) {
    lines.push(Text({ bold: true, children: [section.heading] }))
    if (section.empty) lines.push(Text({ dimColor: true, children: ['  ', section.empty] }))
    for (const row of section.rows) {
      lines.push(
        Text({
          wrap: 'truncate-end',
          children: ['  ', row.name, '  ', row.share, '  ', row.status, '  resets ', row.resets],
        }),
      )
    }
  }
  return Box({ flexDirection: 'column', children: lines })
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    $.ui.status('omp quota: fetching')
    try {
      await $.command.register({
        name: 'quota',
        description: 'Show omp provider quota',
        argumentHint: '[refresh]',
        immediate: true,
      })
    } catch {
      // A refused /quota leaves the status line and the poll working.
    }
    void fetchAndPublish($).catch(() => {})
    // A reload re-fires session.start on this instance; a second timer would double the cadence.
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => {
      void fetchAndPublish($).catch(() => {})
    })
    return next(e)
  })

  on('command.run', { command: 'quota' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    if (args === '') return openPane($)
    if (args === 'refresh') return refresh($)
    return { text: 'usage: /quota [refresh]' }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    return renderPane($, e)
  })
}
