import type { On } from 'claude-code'
import { calModelOf } from './cal-model.ts'
import type { CalView } from './cal-model.ts'
import { calendarsOf, eventsOf, payloadOf, wantedOf } from './events.ts'
import type { CalEvent } from './events.ts'

const SERVER = 'claude.ai Google Calendar'
const DEFAULT_DAYS = 7
const MAX_DAYS = 31
const DAY_MS = 86_400_000
const POLL_MS = 900_000
const RETRY_MS = 30_000
const MAX_RETRIES = 10
const BAND_KEY = 'band'
const DAYS_KEY = 'days'

type Reading = { ok: true; events: CalEvent[] } | { ok: false; reason: string }

let view: CalView = { events: null, failure: null, lastGoodAt: null, days: DEFAULT_DAYS }
let bandOn = false
let excluded: string[] = []
let poll: { cancel(): void } | null = null
let fetchesStarted = 0
let lastPublished = 0
let retries = 0

async function call($: any, tool: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    return payloadOf(await $.mcp.call(SERVER, tool, args))
  } catch {
    return undefined
  }
}

async function fetchEvents($: any, days: number): Promise<Reading> {
  const calendars = calendarsOf(await call($, 'list_calendars', {}))
  if (!calendars) return { ok: false, reason: 'Google Calendar connector did not answer' }
  const now = await $.clock.now()
  const window = { startTime: new Date(now).toISOString(), endTime: new Date(now + days * DAY_MS).toISOString() }
  const wanted = wantedOf(calendars, excluded)
  const lists = await Promise.all(
    wanted.map(async (c) =>
      eventsOf(await call($, 'list_events', { calendarId: c.id, ...window, orderBy: 'startTime', pageSize: 100 })),
    ),
  )
  const failed = wanted.filter((_, i) => lists[i] === null).map((c) => c.name)
  if (failed.length) return { ok: false, reason: `could not read ${failed.join(', ')}` }
  return { ok: true, events: lists.flatMap((l) => l ?? []) }
}

// A fetch that started before one already published would put older data back on screen.
async function fetchAndPublish($: any) {
  const seq = ++fetchesStarted
  const reading = await fetchEvents($, view.days)
  const now = await $.clock.now()
  if (seq < lastPublished) return
  lastPublished = seq
  view = reading.ok
    ? { ...view, events: reading.events, failure: null, lastGoodAt: now }
    : { ...view, failure: reading.reason }
  $.ui.invalidate('ui.render')
  // At session start the claude.ai connectors are still connecting, so a band left on
  // would otherwise read "Unavailable" until the 15-minute poll.
  if (reading.ok) retries = 0
  else if (!view.events && bandOn && retries < MAX_RETRIES) {
    retries += 1
    $.clock.after(RETRY_MS, () => {
      void fetchAndPublish($).catch(() => {})
    })
  }
}

async function remember($: any, key: string, value: unknown) {
  try {
    await $.store.set(key, value)
  } catch {
    // The band still follows the command for this session; only the next one will not remember it.
  }
}

async function readStore($: any) {
  try {
    bandOn = (await $.store.get(BAND_KEY)) === true
    const days = await $.store.get(DAYS_KEY)
    if (Number.isInteger(days) && days >= 1 && days <= MAX_DAYS) view = { ...view, days }
  } catch {
    bandOn = false
  }
}

async function showBand($: any, on: boolean) {
  bandOn = on
  await remember($, BAND_KEY, on)
  $.ui.invalidate('ui.render')
  if (on) void fetchAndPublish($).catch(() => {})
  return {}
}

async function renderBand($: any, e: any) {
  const { Box, Text } = await $.ui.resolve(e)
  const tz = (await $.env.get('TZ')) || Intl.DateTimeFormat().resolvedOptions().timeZone
  const model = calModelOf(view, await $.clock.now(), tz)
  const room = Math.max(1, (e.props.maxRows ?? 10) - (model.notice ? 1 : 0))
  const shown = model.rows.length > room ? [...model.rows.slice(0, room - 1), `… ${model.rows.length - room + 1} more`] : model.rows
  const lines = []
  if (model.notice) lines.push(Text({ dimColor: true, wrap: 'truncate-end', children: [model.notice] }))
  for (const row of shown) lines.push(Text({ wrap: 'truncate-end', children: [row] }))
  return Box({ flexDirection: 'column', children: lines })
}

export function register(on: On, options: { exclude_calendars?: string[] } = {}) {
  excluded = Array.isArray(options.exclude_calendars) ? options.exclude_calendars : []

  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'cal',
        description: 'Show upcoming Google Calendar events above the prompt',
        argumentHint: '[days]',
        immediate: true,
      })
    } catch {
      // A refused /cal leaves nothing else to run.
    }
    await readStore($)
    if (bandOn) void fetchAndPublish($).catch(() => {})
    // A reload re-fires session.start on this instance; a second timer would double the cadence.
    poll?.cancel()
    poll = $.clock.every(POLL_MS, () => {
      if (bandOn) void fetchAndPublish($).catch(() => {})
    })
    return next(e)
  })

  on('command.run', { command: 'cal' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    if (args === '') return showBand($, !bandOn)
    const days = Number(args)
    if (!/^\d+$/.test(args) || days < 1 || days > MAX_DAYS) return { text: `usage: /cal [days], days 1–${MAX_DAYS}` }
    view = { ...view, days }
    await remember($, DAYS_KEY, days)
    return showBand($, true)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!bandOn || e.props.hasSurvey) return next(e)
    return renderBand($, e)
  })
}
