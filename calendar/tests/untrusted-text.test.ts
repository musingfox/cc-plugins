import { describe, expect, test } from 'claude-code/testing'
import { eventsOf } from '../hooks/events.ts'
import { answer, BAND, SESSION, world } from './fixtures/world.ts'

const START = { dateTime: '2026-09-25T14:00:00+08:00' }
const CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/

function stringsIn(node: any): string[] {
  if (typeof node === 'string') return [node]
  if (node?.type === 'Button') return [`[ ${node.props.label} ]`]
  if (!node || typeof node !== 'object') return []
  return [...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(stringsIn)
}

// Draws the band for one calendar whose events are `events`, and returns every drawn string.
async function drawnFor($: any, on: any, events: object[]): Promise<string[]> {
  const w = world(on, {
    store: { band: true },
    mcp: ($: any, e: any) => ({
      value: answer(e.tool === 'list_calendars' ? { calendars: [{ id: 'me@example.test', summary: 'Personal' }] } : { events }),
    }),
  })
  await $.session.start(SESSION)
  await w.clock.settle()
  return stringsIn(await $.ui.render(BAND))
}

describe('CalendarEventTitleClean', () => {
  const eventWith = (fields: object) => ({ events: [{ id: 'x', start: START, ...fields }] })

  test('a title with a line break draws as one line', () => {
    expect(eventsOf(eventWith({ summary: 'Team\nsync' }))![0]!.title).toBe('Team sync')
  })

  test('a title with nothing drawable draws (no title)', () => {
    expect(eventsOf(eventWith({ summary: '\u0007\n' }))![0]!.title).toBe('(no title)')
  })

  test('a missing or non-string title draws (no title)', () => {
    expect(eventsOf(eventWith({}))![0]!.title).toBe('(no title)')
    expect(eventsOf(eventWith({ summary: 42 }))![0]!.title).toBe('(no title)')
  })

  test('a title with a CRLF in the band draws as one clean line', async ($, on) => {
    const drawn = await drawnFor($, on, [{ id: 'e1', summary: 'Dentist\r\nvisit', start: START }])
    expect(drawn).toContain('Dentist visit')
    for (const s of drawn) {
      expect(s).not.toMatch(/[\n\r]/)
      expect(s).not.toMatch(CONTROL_CHARS)
    }
  })

  test('a long title is cut to one line of 1000 characters', async ($, on) => {
    const drawn = await drawnFor($, on, [{ id: 'e1', summary: 'A'.repeat(11000) + '\r', start: START }])
    const title = drawn.find((s) => s.endsWith('…'))
    expect(title).toHaveLength(1000)
    for (const s of drawn) expect(s.length).toBeLessThanOrEqual(10000)
  })
})

describe('CalendarEventLocationClean', () => {
  const eventWith = (fields: object) => ({ events: [{ id: 'x', summary: 'A', start: START, ...fields }] })

  test('a location with a line break reads as one line', () => {
    expect(eventsOf(eventWith({ location: 'Room 1\n2F' }))![0]!.location).toBe('Room 1 2F')
  })

  test('a location with nothing drawable, or no string location, reads as empty', () => {
    expect(eventsOf(eventWith({ location: '\u0007' }))![0]!.location).toBe('')
    expect(eventsOf(eventWith({ location: 42 }))![0]!.location).toBe('')
    expect(eventsOf(eventWith({}))![0]!.location).toBe('')
  })

  test('a location with a line break draws as one @ segment', async ($, on) => {
    const drawn = await drawnFor($, on, [{ id: 'e1', summary: 'A', location: 'Room 1\n2F', start: START }])
    expect(drawn).toContain('  @Room 1 2F')
    for (const s of drawn) expect(s).not.toContain('\n')
  })

  test('a location with nothing drawable draws no @ segment', async ($, on) => {
    const drawn = await drawnFor($, on, [{ id: 'e1', summary: 'A', location: '\u0007', start: START }])
    expect(drawn).toContain('A')
    expect(drawn.some((s) => s.trimStart().startsWith('@'))).toBe(false)
  })

  test('a long location is cut to a 1000-character @ segment', async ($, on) => {
    const drawn = await drawnFor($, on, [{ id: 'e1', summary: 'A', location: 'L'.repeat(11000) + '\r', start: START }])
    const segment = drawn.map((s) => s.trimStart()).find((s) => s.startsWith('@'))
    expect(segment).toHaveLength(1001)
    for (const s of drawn) expect(s.length).toBeLessThanOrEqual(10000)
  })
})

describe('CalendarLocationUrlAgreement', () => {
  const eventWith = (fields: object) => ({ events: [{ id: 'x', summary: 'A', start: START, ...fields }] })

  test('a location that is a link with a trailing line break is the event url', () => {
    const [event] = eventsOf(eventWith({ location: 'https://zoom.example.test/j/9\n' }))!
    expect(event!.url).toBe('https://zoom.example.test/j/9')
    expect(event!.location).toBe(event!.url)
  })

  test('a location that is a link after a leading line break is the event url', () => {
    expect(eventsOf(eventWith({ location: '\nhttps://x.example.test' }))![0]!.url).toBe('https://x.example.test')
  })

  test('a hangout link stays the url, and the location is still cleaned', () => {
    const [event] = eventsOf(eventWith({ location: 'Home\n2F', hangoutLink: 'https://meet.google.com/abc-defg-hij' }))!
    expect([event!.url, event!.location]).toEqual(['https://meet.google.com/abc-defg-hij', 'Home 2F'])
  })

  test('a link location draws the link button and no @ segment', async ($, on) => {
    const drawn = await drawnFor($, on, [{ id: 'e1', summary: 'A', location: 'https://zoom.example.test/j/9\n', start: START }])
    expect(drawn).toContain('[ 連結 ]')
    expect(drawn.some((s) => s.trimStart().startsWith('@'))).toBe(false)
  })
})
