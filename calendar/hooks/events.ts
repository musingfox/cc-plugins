export type CalTime = { kind: 'date'; date: string } | { kind: 'time'; ms: number }

export type CalEvent = { id: string; title: string; location: string; start: CalTime; end: CalTime | null }

export type Calendar = { id: string; name: string }

function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

// An MCP tool answers its JSON as the text of its content blocks.
export function payloadOf(result: unknown): unknown {
  if (field(result, 'isError') === true) return undefined
  const blocks = field(result, 'content')
  if (!Array.isArray(blocks)) return undefined
  const text = blocks.map((b) => (field(b, 'type') === 'text' ? stringOf(field(b, 'text')) : '')).join('')
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function timeOf(raw: unknown): CalTime | null {
  const dateTime = stringOf(field(raw, 'dateTime'))
  if (dateTime) {
    const ms = Date.parse(dateTime)
    return Number.isFinite(ms) ? { kind: 'time', ms } : null
  }
  const date = stringOf(field(raw, 'date'))
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { kind: 'date', date } : null
}

export function calendarsOf(payload: unknown): Calendar[] | null {
  const list = field(payload, 'calendars')
  if (!Array.isArray(list)) return null
  return list.flatMap((c) => {
    const id = stringOf(field(c, 'id'))
    return id ? [{ id, name: stringOf(field(c, 'summary')) || id }] : []
  })
}

// A calendar with no events in the window answers no `events` key at all.
export function eventsOf(payload: unknown): CalEvent[] | null {
  if (payload === null || typeof payload !== 'object') return null
  const list = field(payload, 'events') ?? []
  if (!Array.isArray(list)) return null
  return list.flatMap((raw) => {
    const start = timeOf(field(raw, 'start'))
    if (!start || field(raw, 'status') === 'cancelled') return []
    return [
      {
        id: stringOf(field(raw, 'id')),
        title: stringOf(field(raw, 'summary')) || '(no title)',
        location: stringOf(field(raw, 'location')),
        start,
        end: timeOf(field(raw, 'end')),
      },
    ]
  })
}

export function wantedOf(calendars: Calendar[], excluded: string[]): Calendar[] {
  return calendars.filter((c) => !excluded.includes(c.name) && !excluded.includes(c.id))
}
