import type { On } from 'claude-code'
import { quotaModelOf } from './quota-model.ts'
import type { QuotaView, WindowCell } from './quota-model.ts'
import { readUsage, worsenedProviders } from './usage.ts'
import type { OmpOutcome, UsageReading } from './usage.ts'

const FETCH_ARGV = ['omp', 'usage', '--json']
const INVALIDATE_ARGV = ['omp', 'usage', 'invalidate']
const OMP_TIMEOUT_MS = 10_000
const POLL_MS = 300_000
const BAND_KEY = 'band'

let view: QuotaView = { usage: null, failure: null, lastGoodAt: null }
let bandOn = false
let poll: { cancel(): void } | null = null
let fetchesStarted = 0
let lastPublished = 0

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

// A fetch that started before one already published would put older data back on screen.
async function publish($: any, seq: number, reading: UsageReading) {
  const now = await $.clock.now()
  if (seq < lastPublished) return
  lastPublished = seq
  if (reading.ok) {
    const worsened = worsenedProviders(view.usage, reading.usage)
    view = { usage: reading.usage, failure: null, lastGoodAt: now }
    if (worsened.length) $.ui.toast(`omp quota: ${worsened.map((w) => `${w.provider} now ${w.status}`).join(', ')}`)
  } else {
    view = { ...view, failure: reading.reason }
  }
  $.ui.invalidate('ui.render')
}

async function fetchAndPublish($: any) {
  const seq = ++fetchesStarted
  await publish($, seq, await fetchUsage($))
}

async function refresh($: any) {
  const home = await $.env.get('HOME')
  if (!home) {
    await publish($, ++fetchesStarted, { ok: false, reason: 'HOME is unset' })
    return { text: 'omp quota refresh failed: HOME is unset' }
  }
  const invalidated = await runOmp($, home, INVALIDATE_ARGV)
  const seq = ++fetchesStarted
  const reading = readUsage(await runOmp($, home, FETCH_ARGV))
  await publish($, seq, reading)
  const note = invalidated.kind === 'exited' && invalidated.exitCode === 0 ? '' : ' (cache not invalidated)'
  return { text: reading.ok ? `omp quota refreshed${note}` : `omp quota refresh failed: ${reading.reason}${note}` }
}

async function readBand($: any) {
  try {
    bandOn = (await $.store.get(BAND_KEY)) === true
  } catch {
    bandOn = false
  }
}

async function toggleBand($: any) {
  bandOn = !bandOn
  try {
    await $.store.set(BAND_KEY, bandOn)
  } catch {
    // The band still toggles for this session; only the next one will not remember it.
  }
  $.ui.invalidate('ui.render')
  return {}
}

// Every window cell is padded to the widest one in its column, so windows line up across
// providers; a line's last cell is left unpadded so no line ends in spaces.
async function renderBand($: any, e: any) {
  const { Box, Text } = await $.ui.resolve(e)
  const model = quotaModelOf(view, await $.clock.now())
  const cells = model.providers.flatMap((p) => p.windows)
  const nameWidth = Math.max(0, ...model.providers.map((p) => p.provider.length))
  const windowWidth = Math.max(0, ...cells.map((c) => c.window.length))
  const cellText = (c: WindowCell) =>
    `${c.window.padEnd(windowWidth)} ${c.share.padStart(4)} ${c.resets}${c.status ? ` ${c.status}` : ''}`
  const columnWidths: number[] = []
  for (const { windows } of model.providers) {
    windows.slice(0, -1).forEach((c, i) => (columnWidths[i] = Math.max(columnWidths[i] ?? 0, cellText(c).length)))
  }
  const cellSpans = (c: WindowCell, i: number, last: boolean) => {
    const padded = last ? cellText(c) : cellText(c).padEnd(columnWidths[i]!)
    const at = windowWidth + 1 + 4 - c.share.length
    const share = c.shareColor ? Text({ color: c.shareColor, children: [c.share] }) : c.share
    return ['  ', padded.slice(0, at), share, padded.slice(at + c.share.length)]
  }
  const lines = []
  if (model.notice) lines.push(Text({ dimColor: true, wrap: 'truncate-end', children: [model.notice] }))
  for (const { provider, windows } of model.providers) {
    const spans = windows.flatMap((c, i) => cellSpans(c, i, i === windows.length - 1))
    lines.push(Text({ wrap: 'truncate-end', children: [provider.padEnd(nameWidth), ...spans] }))
  }
  return Box({ flexDirection: 'column', children: lines })
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'quota',
        description: 'Show omp provider quota',
        argumentHint: '[refresh]',
        immediate: true,
      })
    } catch {
      // A refused /quota leaves the poll working.
    }
    await readBand($)
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
    if (args === '') return toggleBand($)
    if (args === 'refresh') return refresh($)
    return { text: 'usage: /quota [refresh]' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!bandOn || e.props.hasSurvey) return next(e)
    return renderBand($, e)
  })
}
