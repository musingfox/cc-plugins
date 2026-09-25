import { mock } from 'claude-code/testing'

// 2026-09-25 10:00 in Asia/Taipei.
export const NOW = Date.UTC(2026, 8, 25, 2, 0)

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

export const BAND = {
  component: 'AbovePrompt',
  surface: 'terminal',
  requestId: 'above-prompt',
  viewport: { columns: 160, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

// Synthetic calendars: no real account data belongs in this repo.
export const CALENDARS = {
  calendars: [
    { id: 'me@example.test', summary: 'Personal', timeZone: 'Asia/Taipei' },
    { id: 'family@group.example.test', summary: 'Family', timeZone: 'UTC' },
    { id: 'holiday@group.example.test', summary: 'Holidays', timeZone: 'Asia/Taipei' },
  ],
}

const DENTIST = {
  id: 'e1',
  summary: 'Dentist',
  location: 'Clinic',
  status: 'confirmed',
  start: { dateTime: '2026-09-25T14:00:00+08:00' },
  end: { dateTime: '2026-09-25T15:00:00+08:00' },
}

export const EVENTS: Record<string, object> = {
  'me@example.test': {
    events: [
      DENTIST,
      {
        id: 'e2',
        summary: 'Trip',
        status: 'confirmed',
        start: { dateTime: '2026-09-27T22:00:00+08:00' },
        end: { dateTime: '2026-09-28T01:30:00+08:00' },
      },
      { id: 'e3', summary: 'Old', status: 'cancelled', start: { dateTime: '2026-09-26T09:00:00+08:00' } },
    ],
    timeZone: 'Asia/Taipei',
  },
  'family@group.example.test': {
    events: [
      DENTIST,
      {
        id: 'e4',
        summary: 'Dinner',
        location: 'Home',
        status: 'confirmed',
        start: { dateTime: '2026-09-28T10:00:00Z' },
        end: { dateTime: '2026-09-28T13:00:00Z' },
      },
    ],
    timeZone: 'UTC',
  },
  'holiday@group.example.test': {
    events: [{ id: 'e5', summary: '中秋節', status: 'confirmed', start: { date: '2026-09-26' }, end: { date: '2026-09-27' } }],
    timeZone: 'Asia/Taipei',
  },
}

export const BAND_LINES = [
  '今天      14:00–15:00        Dentist  @Clinic  還有 4h',
  '明天      全天               中秋節',
  '09/27 日  22:00–09/28 01:30  Trip',
  '09/28 一  18:00–21:00        Dinner  @Home',
]

export function answer(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }], isError: false }
}

type Hook = (...args: any[]) => unknown

export type WorldOptions = {
  store?: Record<string, unknown> | 'refuse'
  mcp?: Hook
}

// A stub world beneath the plugin: every $ call it makes is answered and recorded here.
export function world(on: any, options: WorldOptions = {}) {
  const calls: any[] = []
  const state = { invalidates: 0 }

  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { TZ: 'Asia/Taipei' })
  if (options.store === 'refuse') {
    for (const call of ['store.get', 'store.set']) on(call, () => ({ deny: 'store unavailable' }))
  } else {
    mock.store(on, options.store ?? {})
  }
  on('command.register', ($: any, e: any) => ({ value: { command: e.name } }))
  on(
    'mcp.call',
    options.mcp ??
      (($: any, e: any) => {
        calls.push(e)
        if (e.tool === 'list_calendars') return { value: answer(CALENDARS) }
        return { value: answer(EVENTS[e.args.calendarId] ?? {}) }
      }),
  )
  on('ui.invalidate', () => {
    state.invalidates += 1
    return { value: undefined }
  })

  return {
    clock,
    calls,
    get invalidates() {
      return state.invalidates
    },
  }
}
