import { describe, expect, test } from 'claude-code/testing'
import { calModelOf, cellsOf, lineOf } from '../hooks/cal-model.ts'
import { calendarsOf, eventsOf, payloadOf, wantedOf } from '../hooks/events.ts'
import { answer, BAND_LINES, CALENDARS, EVENTS, NOW } from './fixtures/world.ts'

const TZ = 'Asia/Taipei'

function allEvents() {
  return Object.values(EVENTS).flatMap((payload) => eventsOf(payload)!)
}

describe('payloadOf', () => {
  test('reads the JSON of the text blocks', () => {
    expect(payloadOf(answer({ a: 1 }))).toEqual({ a: 1 })
  })

  test('an error result or text that is not JSON reads as nothing', () => {
    expect(payloadOf({ content: [{ type: 'text', text: '{}' }], isError: true })).toBeUndefined()
    expect(payloadOf({ content: [{ type: 'text', text: 'nope' }], isError: false })).toBeUndefined()
  })
})

describe('calendarsOf and wantedOf', () => {
  test('lists every calendar by id and name', () => {
    expect(calendarsOf(CALENDARS)!.map((c) => c.name)).toEqual(['Personal', 'Family', 'Holidays'])
  })

  test('a payload without a calendar list is a failure', () => {
    expect(calendarsOf({})).toBeNull()
  })

  test('an excluded calendar is left out by name or by id', () => {
    const calendars = calendarsOf(CALENDARS)!
    expect(wantedOf(calendars, ['Family', 'holiday@group.example.test']).map((c) => c.name)).toEqual(['Personal'])
  })
})

describe('eventsOf', () => {
  test('keeps timed and all-day events and drops cancelled ones', () => {
    expect(eventsOf(EVENTS['me@example.test'])!.map((e) => e.title)).toEqual(['Dentist', 'Trip'])
    expect(eventsOf(EVENTS['holiday@group.example.test'])![0]!.start).toEqual({ kind: 'date', date: '2026-09-26' })
  })

  test('a calendar with no events answers an empty list, not a failure', () => {
    expect(eventsOf({ timeZone: TZ })).toEqual([])
  })

  test('an unreadable payload is a failure', () => {
    expect(eventsOf(undefined)).toBeNull()
    expect(eventsOf({ events: 'x' })).toBeNull()
  })
})

describe('calModelOf', () => {
  const good = { events: allEvents(), failure: null, lastGoodAt: NOW, days: 7 }

  test('one row per event in local time, soonest first, duplicates merged, columns aligned', () => {
    const model = calModelOf(good, NOW, TZ)
    expect(model.notice).toBeNull()
    expect(model.rows.map(lineOf)).toEqual(BAND_LINES)
  })

  test('only the first timed event is marked next', () => {
    expect(calModelOf(good, NOW, TZ).rows.map((r) => r.isNext)).toEqual([true, false, false, false])
  })

  test('an event under way reads 進行中 and is the next one', () => {
    const events = eventsOf({
      events: [{ id: 'x', summary: 'Standup', start: { dateTime: '2026-09-25T09:30:00+08:00' }, end: { dateTime: '2026-09-25T10:30:00+08:00' } }],
    })!
    const [row] = calModelOf({ ...good, events }, NOW, TZ).rows
    expect([row!.note, row!.isNext]).toEqual(['進行中', true])
  })

  test('a countdown under an hour reads minutes only', () => {
    const events = eventsOf({ events: [{ id: 'x', summary: 'Call', start: { dateTime: '2026-09-25T10:45:00+08:00' } }] })!
    expect(calModelOf({ ...good, events }, NOW, TZ).rows[0]!.note).toBe('還有 45m')
  })

  test('says it is fetching before any fetch settles', () => {
    expect(calModelOf({ events: null, failure: null, lastGoodAt: null, days: 7 }, NOW, TZ)).toEqual({
      notice: 'Fetching calendar events',
      rows: [],
    })
  })

  test('names the failure when no fetch has succeeded', () => {
    const model = calModelOf({ events: null, failure: 'x did not answer', lastGoodAt: null, days: 7 }, NOW, TZ)
    expect(model.notice).toBe('Unavailable: x did not answer')
  })

  test('a failure after good data keeps the rows and says how old they are', () => {
    const model = calModelOf({ ...good, failure: 'x did not answer', lastGoodAt: NOW - 1_200_000 }, NOW, TZ)
    expect(model.notice).toBe('Stale: x did not answer; showing data from 20m ago')
    expect(model.rows).toHaveLength(4)
  })

  test('an empty window says so', () => {
    expect(calModelOf({ ...good, events: [] }, NOW, TZ)).toEqual({ notice: 'No events in the next 7 days', rows: [] })
  })

  test('a CJK character takes two cells', () => {
    expect(cellsOf('全天')).toBe(4)
    expect(cellsOf('18:00')).toBe(5)
  })
})
