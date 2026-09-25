import type { CalEvent, CalTime } from './events.ts'

export type CalView = { events: CalEvent[] | null; failure: string | null; lastGoodAt: number | null; days: number }

export type CalModel = { notice: string | null; rows: string[] }

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
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

function dayLabelOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${date.slice(5, 7)}/${date.slice(8, 10)} ${WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]}`
}

function startOf(time: CalTime, tz: string): Local {
  return time.kind === 'date' ? { date: time.date, time: '' } : localOf(time.ms, tz)
}

function spanOf(event: CalEvent, start: Local, tz: string): string {
  if (event.start.kind === 'date') return ALL_DAY
  if (!event.end || event.end.kind === 'date') return start.time
  const end = localOf(event.end.ms, tz)
  return end.date === start.date ? `${start.time}–${end.time}` : `${start.time}–${dayLabelOf(end.date).slice(0, 5)} ${end.time}`
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
  if (ms >= HOUR) return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MINUTE)}m`
  return `${Math.floor(ms / MINUTE)}m`
}

function rowsOf(events: CalEvent[], tz: string): string[] {
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
    .map(({ event, start }) => ({ day: dayLabelOf(start.date), span: spanOf(event, start, tz), event }))
  const spanWidth = Math.max(0, ...lines.map((l) => cellsOf(l.span)))
  return lines.map(({ day, span, event }) =>
    [day, padCells(span, spanWidth), event.title + (event.location ? `  @${event.location}` : '')].join('  '),
  )
}

export function calModelOf(view: CalView, nowMs: number, tz: string): CalModel {
  if (!view.events) {
    return { notice: view.failure ? `Unavailable: ${view.failure}` : 'Fetching calendar events', rows: [] }
  }
  const stale = view.failure
    ? `Stale: ${view.failure}; showing data from ${durationOf(nowMs - (view.lastGoodAt ?? nowMs))} ago`
    : null
  const rows = rowsOf(view.events, tz)
  const empty = rows.length ? null : `No events in the next ${view.days} days`
  return { notice: stale ?? empty, rows }
}
