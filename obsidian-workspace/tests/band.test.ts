import { expect, test } from 'claude-code/testing'
import { BAND, bandLines, bandRows, handlerOf } from './fixtures/band.ts'
import { CONFIG_PATH, nodesOf, stringsIn } from './fixtures/pane.ts'
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
const BENEATH = { type: 'Text', children: ['beneath'] }
const A = 'pm/cc-plugins/tasks/a.md'
const TITLE = 'Claude Mod：面板顯示 obw 的 task 與 issue'

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

const BOUND_LINES = [`● a  ${TITLE}  AC 0/1`, 'beneath']
const band = async ($: any, w: any) => {
  await started($, w)
  return bandLines($)
}

test('BL1 a bound session draws its card above the prompt', async ($, on) => {
  const w = world(on, boundToA({ beneath: BENEATH }))
  expect(await band($, w)).toEqual(BOUND_LINES)
  const tree = await $.ui.render(BAND)
  expect(nodesOf(tree, 'Text').find((node) => stringsIn(node).join('') === '●').props.color).toBe('success')
  expect(bandRows(tree)[0].props.wrap).toBe('truncate-end')
})

test('BL2 a failed card read draws the name alone', async ($, on) => {
  const w = world(on, boundToA({ beneath: BENEATH, reads: {} }))
  expect(await band($, w)).toEqual(['● a', 'beneath'])
})

test('BL3 a card without AC draws its title alone', async ($, on) => {
  const w = world(on, boundToA({ beneath: BENEATH, reads: { [A]: '---\ntitle: t\n---\n# t\n' } }))
  expect(await band($, w)).toEqual(['● a  t', 'beneath'])
})

test('BL4 a card read still running draws the name, then the card', async ($, on) => {
  const w = world(on, boundToA({ beneath: BENEATH, reads: { [A]: 'defer' } }))
  await started($, w)
  expect(await bandLines($)).toEqual(['● a', 'beneath'])
  w.release(0, CARD)
  await w.clock.settle()
  expect(await bandLines($)).toEqual(BOUND_LINES)
})

test('BL5 control characters in a title are stripped', async ($, on) => {
  const w = world(on, boundToA({ beneath: BENEATH, reads: { [A]: CARD.replace(TITLE, 'x\u0007y') } }))
  expect((await band($, w))[0]).toMatch(/^● a {2}xy/)
})

test('BL6 a cc-mobile binding with extra fields draws the same line', async ($, on) => {
  const record = '{"cardPath":"pm/cc-plugins/tasks/a.md","vault":"obsidian","project":"cc-plugins","paneId":"%12","createdAt":"2026-10-07T01:00:00Z"}'
  const w = world(on, boundToA({ beneath: BENEATH, files: { [CONFIG_PATH]: CONFIG, [BIND]: record } }))
  expect(await band($, w)).toEqual(BOUND_LINES)
})

test('BL7 a denied card read draws the name alone', async ($, on) => {
  const w = world(on, boundToA({ beneath: BENEATH, reads: { [A]: { deny: 'process is CLI only' } } }))
  expect(await band($, w)).toEqual(['● a', 'beneath'])
})
