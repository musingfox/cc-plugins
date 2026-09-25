import { describe, expect, test } from 'claude-code/testing'
import { calModelOf, cellsOf } from '../hooks/cal-model.ts'
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

  test('one row per event in local time, soonest first, duplicates merged, times aligned', () => {
    expect(calModelOf(good, NOW, TZ)).toEqual({ notice: null, rows: BAND_LINES })
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
    expect(model.rows).toEqual(BAND_LINES)
  })

  test('an empty window says so', () => {
    expect(calModelOf({ ...good, events: [] }, NOW, TZ)).toEqual({ notice: 'No events in the next 7 days', rows: [] })
  })

  test('a CJK character takes two cells', () => {
    expect(cellsOf('全天')).toBe(4)
    expect(cellsOf('18:00')).toBe(5)
  })
})
