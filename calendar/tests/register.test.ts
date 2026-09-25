import { describe, expect, test } from 'claude-code/testing'
import { answer, BAND, BAND_LINES, CALENDARS, EVENTS, NOW, SESSION, world } from './fixtures/world.ts'

function stringsIn(node: any): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  return [...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(stringsIn)
}

function linesOf(tree: any): string[] {
  return (tree.props?.children ?? tree.children).map((line: any) => stringsIn(line).join(''))
}

const BENEATH = { type: 'Text', children: ['beneath'] }

function beneath(on: any) {
  on('ui.render', { component: 'AbovePrompt' }, () => BENEATH)
}

describe('/cal', () => {
  test('the band is off until /cal, and nothing is fetched while it is', async ($, on) => {
    const w = world(on)
    beneath(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(900000)
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
    expect(w.calls).toEqual([])
  })

  test('/cal shows the next 7 days of every calendar, answering nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(await $.command.run({ command: 'cal' })).toEqual({})
    await w.clock.settle()
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
    const listed = w.calls.filter((c) => c.tool === 'list_events')
    expect(listed.map((c) => c.args.calendarId)).toEqual([
      'me@example.test',
      'family@group.example.test',
      'holiday@group.example.test',
    ])
    expect(w.calls[0]).toEqual({ server: 'claude.ai Google Calendar', tool: 'list_calendars', args: {} })
    expect(listed[0].args.startTime).toBe(new Date(NOW).toISOString())
    expect(listed[0].args.endTime).toBe(new Date(NOW + 7 * 86400000).toISOString())
  })

  test('/cal again turns the band off', async ($, on) => {
    const w = world(on)
    beneath(on)
    await $.session.start(SESSION)
    await $.command.run({ command: 'cal' })
    await w.clock.settle()
    await $.command.run({ command: 'cal' })
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
  })

  test('/cal N asks for N days and turns the band on', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.command.run({ command: 'cal' })
    await w.clock.settle()
    await $.command.run({ command: 'cal', args: '14' })
    await w.clock.settle()
    const last = w.calls.filter((c) => c.tool === 'list_events').at(-1)
    expect(last.args.endTime).toBe(new Date(NOW + 14 * 86400000).toISOString())
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
  })

  test('other arguments answer the usage line and fetch nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    for (const args of ['0', '32', 'refresh', '1.5']) {
      expect(await $.command.run({ command: 'cal', args })).toEqual({ text: 'usage: /cal [days], days 1–31' })
    }
    expect(w.calls).toEqual([])
  })

  test('the band and the day count are remembered by the next session', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.command.run({ command: 'cal', args: '3' })
    await $.session.start(SESSION)
    await w.clock.settle()
    const last = w.calls.filter((c) => c.tool === 'list_events').at(-1)
    expect(last.args.endTime).toBe(new Date(NOW + 3 * 86400000).toISOString())
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
  })

  test('a store that refuses leaves the band off at start and still toggles it', async ($, on) => {
    const w = world(on, { store: 'refuse' })
    beneath(on)
    await $.session.start(SESSION)
    expect(await $.ui.render(BAND)).toEqual(BENEATH)
    await $.command.run({ command: 'cal' })
    await w.clock.settle()
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
  })
})

describe('fetching', () => {
  test('refetches every 15 minutes while the band is on', async ($, on) => {
    const w = world(on, { store: { band: true } })
    await $.session.start(SESSION)
    await w.clock.settle()
    const count = () => w.calls.filter((c) => c.tool === 'list_calendars').length
    expect(count()).toBe(1)
    await w.clock.advance(900000)
    expect(count()).toBe(2)
  })

  test('an unconnected connector shows why, and never throws', async ($, on) => {
    const w = world(on, { store: { band: true }, mcp: () => ({ deny: 'server not connected' }) })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(linesOf(await $.ui.render(BAND))).toEqual(['Unavailable: Google Calendar connector did not answer'])
  })

  test('a connector still connecting at session start is retried every 30 s, 10 times at most', async ($, on) => {
    let refusals = 3
    const calls: string[] = []
    const w = world(on, {
      store: { band: true },
      mcp: ($: any, e: any) => {
        calls.push(e.tool)
        if (refusals > 0 && e.tool === 'list_calendars') {
          refusals -= 1
          return { deny: 'no connected MCP tool' }
        }
        return { value: answer(e.tool === 'list_calendars' ? CALENDARS : (EVENTS[e.args.calendarId] ?? {})) }
      },
    })
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(linesOf(await $.ui.render(BAND))).toEqual(['Unavailable: Google Calendar connector did not answer'])
    await w.clock.advance(90000)
    expect(linesOf(await $.ui.render(BAND))).toEqual(BAND_LINES)
    const before = calls.length
    await w.clock.advance(60000)
    expect(calls.length).toBe(before)
  })

  test('a connector that never connects stops being retried after 10 tries', async ($, on) => {
    let tries = 0
    const w = world(on, {
      store: { band: true },
      mcp: () => {
        tries += 1
        return { deny: 'no connected MCP tool' }
      },
    })
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(600000)
    expect(tries).toBe(11)
  })

  test('a calendar that cannot be read keeps the last rows and marks them stale', async ($, on) => {
    let broken = false
    const w = world(on, {
      store: { band: true },
      mcp: ($: any, e: any) => {
        if (e.tool === 'list_calendars')
          return { value: { content: [{ type: 'text', text: JSON.stringify({ calendars: [{ id: 'me@example.test', summary: 'Personal' }] }) }], isError: false } }
        if (broken) return { value: { content: [{ type: 'text', text: 'boom' }], isError: true } }
        return {
          value: {
            content: [{ type: 'text', text: JSON.stringify({ events: [{ id: 'e1', summary: 'Dentist', start: { dateTime: '2026-09-25T14:00:00+08:00' }, end: { dateTime: '2026-09-25T15:00:00+08:00' } }] }) }],
            isError: false,
          },
        }
      },
    })
    await $.session.start(SESSION)
    await w.clock.settle()
    broken = true
    await w.clock.advance(900000)
    expect(linesOf(await $.ui.render(BAND))).toEqual([
      'Stale: could not read Personal; showing data from 15m ago',
      '09/25 週五  14:00–15:00  Dentist',
    ])
  })

  test('more rows than the band holds end in a count of the rest', async ($, on) => {
    const w = world(on, { store: { band: true } })
    await $.session.start(SESSION)
    await w.clock.settle()
    const tree = await $.ui.render({ ...BAND, props: { ...BAND.props, maxRows: 3 } })
    expect(linesOf(tree)).toEqual([BAND_LINES[0], BAND_LINES[1], '… 2 more'])
  })

  test('yields to a survey holding the band', async ($, on) => {
    const w = world(on, { store: { band: true } })
    beneath(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    expect(await $.ui.render({ ...BAND, props: { ...BAND.props, hasSurvey: true } })).toEqual(BENEATH)
  })
})
