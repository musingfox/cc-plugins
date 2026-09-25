import type { CalEvent, CalTime } from './events.ts'

export type CalView = { events: CalEvent[] | null; failure: string | null; lastGoodAt: number | null; days: number }

// `day` and `span` arrive padded to their column; `note` is today's countdown.
export type CalRow = { day: string; span: string; title: string; location: string; note: string; isNext: boolean }

export type CalModel = { notice: string | null; rows: CalRow[] }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY_MS = 24 * HOUR
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const ALL_DAY = '全天'

type Local = { date: string; time: string }

function localOf(ms: number, tz: string): Local {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ms)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` }
}

function monthDayOf(date: string): string {
  return `${date.slice(5, 7)}/${date.slice(8, 10)}`
}

function dayLabelOf(date: string, today: string, tomorrow: string): string {
  if (date === today) return '今天'
  if (date === tomorrow) return '明天'
  const [y, m, d] = date.split('-').map(Number)
  return `${monthDayOf(date)} ${WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]}`
}

function startOf(time: CalTime, tz: string): Local {
  return time.kind === 'date' ? { date: time.date, time: '' } : localOf(time.ms, tz)
}

function spanOf(event: CalEvent, start: Local, tz: string): string {
  if (event.start.kind === 'date') return ALL_DAY
  if (!event.end || event.end.kind === 'date') return start.time
  const end = localOf(event.end.ms, tz)
  return end.date === start.date ? `${start.time}–${end.time}` : `${start.time}–${monthDayOf(end.date)} ${end.time}`
}

// Terminal cells: a CJK character takes two.
export function cellsOf(text: string): number {
  let cells = 0
  for (const ch of text) cells += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1
  return cells
}

function padCells(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - cellsOf(text)))
}

function durationOf(ms: number): string {
  const h = Math.floor(ms / HOUR)
  const m = Math.floor((ms % HOUR) / MINUTE)
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`
}

function noteOf(event: CalEvent, start: Local, today: string, nowMs: number): string {
  if (event.start.kind !== 'time' || start.date !== today) return ''
  return event.start.ms <= nowMs ? '進行中' : `還有 ${durationOf(event.start.ms - nowMs)}`
}

export function lineOf(row: CalRow): string {
  return [row.day, row.span, row.title, row.location && `@${row.location}`, row.note].filter(Boolean).join('  ')
}

function rowsOf(events: CalEvent[], nowMs: number, tz: string): CalRow[] {
  const today = localOf(nowMs, tz).date
  const tomorrow = localOf(nowMs + DAY_MS, tz).date
  const seen = new Set<string>()
  const lines = events
    .map((event) => ({ event, start: startOf(event.start, tz) }))
    .filter(({ event, start }) => {
      const key = `${event.id}|${start.date}|${start.time}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => `${a.start.date} ${a.start.time}`.localeCompare(`${b.start.date} ${b.start.time}`))
    .map(({ event, start }) => ({
      day: dayLabelOf(start.date, today, tomorrow),
      span: spanOf(event, start, tz),
      event,
      note: noteOf(event, start, today, nowMs),
    }))
  const dayWidth = Math.max(0, ...lines.map((l) => cellsOf(l.day)))
  const spanWidth = Math.max(0, ...lines.map((l) => cellsOf(l.span)))
  const next = lines.findIndex((l) => l.event.start.kind === 'time')
  return lines.map(({ day, span, event, note }, i) => ({
    day: padCells(day, dayWidth),
    span: padCells(span, spanWidth),
    title: event.title,
    location: event.location,
    note,
    isNext: i === next,
  }))
}

export function calModelOf(view: CalView, nowMs: number, tz: string): CalModel {
  if (!view.events) {
    return { notice: view.failure ? `Unavailable: ${view.failure}` : 'Fetching calendar events', rows: [] }
  }
  const stale = view.failure
    ? `Stale: ${view.failure}; showing data from ${durationOf(nowMs - (view.lastGoodAt ?? nowMs))} ago`
    : null
  const rows = rowsOf(view.events, nowMs, tz)
  const empty = rows.length ? null : `No events in the next ${view.days} days`
  return { notice: stale ?? empty, rows }
}
