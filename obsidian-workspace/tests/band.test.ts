import { expect, test } from 'claude-code/testing'
import { CONFIG_PATH } from './fixtures/pane.ts'
import { CARD, CONFIG, SESSION, world } from './fixtures/world.ts'

const BIND = '/Users/u/.claude-mobile/launches/sid-1.json'
const RECORD_A = '{"cardPath":"pm/cc-plugins/tasks/a.md","vault":"obsidian","project":"cc-plugins","createdAt":"2026-10-07T00:00:00.000Z"}'
const boundToA = (extra: any = {}) => ({
  env: { HOME: '/Users/u' },
  sessionId: 'sid-1',
  files: { [CONFIG_PATH]: CONFIG, [BIND]: RECORD_A },
  reads: { 'pm/cc-plugins/tasks/a.md': CARD },
  ...extra,
})
const started = async ($: any, w: any) => {
  await $.session.start(SESSION)
  await w.clock.settle()
}

test('S1 a session with a binding file loads it and reads its card', async ($, on) => {
  const w = world(on, boundToA())
  await started($, w)
  expect(w.readCalls).toEqual([BIND])
  expect(w.runs.map((r: any) => r.argv)).toEqual([['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/a.md']])
})

test('S2 without env or session id nothing is touched', async ($, on) => {
  const w = world(on, {})
  await started($, w)
  expect(w.existsCalls).toEqual([])
  expect(w.readCalls).toEqual([])
  expect(w.runs).toEqual([])
})

test('S3 without a binding file only existence is checked', async ($, on) => {
  const w = world(on, { env: { HOME: '/Users/u' }, sessionId: 'sid-1' })
  await started($, w)
  expect(w.existsCalls).toEqual([BIND])
  expect(w.readCalls).toEqual([])
  expect(w.runs).toEqual([])
})

test('S4 OBW_LAUNCHES_DIR moves the binding file', async ($, on) => {
  const w = world(on, { env: { HOME: '/Users/u', OBW_LAUNCHES_DIR: '/alt' }, sessionId: 'sid-1' })
  await started($, w)
  expect(w.existsCalls).toEqual(['/alt/sid-1.json'])
})

test('S5 an unparsable binding file runs no card read', async ($, on) => {
  const w = world(on, boundToA({ files: { [CONFIG_PATH]: CONFIG, [BIND]: 'not json' } }))
  await started($, w)
  expect(w.readCalls).toEqual([BIND])
  expect(w.runs).toEqual([])
})

test('S6 a denied binding read leaves session start intact', async ($, on) => {
  const w = world(on, boundToA({ files: { [CONFIG_PATH]: CONFIG, [BIND]: { deny: 'EACCES' } } }))
  expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
  expect(w.registered[0].name).toBe('issue')
})

test('S7 the path is not built before the session id resolves', async ($, on) => {
  const w = world(on, { env: { HOME: '/Users/u' } })
  await started($, w)
  expect(w.existsCalls).toEqual([])
})
