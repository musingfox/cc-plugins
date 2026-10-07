import { expect, test } from 'claude-code/testing'
import { BAND, bandLines, bandRows, handlerOf } from './fixtures/band.ts'
import { CONFIG_PATH, nodesOf, runsOf, stringsIn } from './fixtures/pane.ts'
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

test('BP1 without a binding the band is what the others drew', async ($, on) => {
  world(on, { env: { HOME: '/Users/u' }, sessionId: 'sid-1', beneath: BENEATH })
  await $.session.start(SESSION)
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('BP2 during a survey the band is what the others drew', async ($, on) => {
  const w = world(on, boundToA({ beneath: BENEATH }))
  await started($, w)
  expect(await $.ui.render({ ...BAND, props: { ...BAND.props, hasSurvey: true } })).toEqual(BENEATH)
})

test('BP3 a fault while drawing the line leaves what the others drew', async () => {
  const faulty = {
    command: { register: async () => {} },
    env: { get: async (key: string) => (key === 'HOME' ? '/Users/u' : undefined) },
    session: { id: async () => 'sid-1' },
    fs: { exists: async () => true, read: async () => RECORD_A },
    process: { run: async () => ({ exitCode: 0, stdout: CARD, stderr: '' }) },
    ui: { invalidate: () => {}, resolve: async () => ({ Box: () => ({}), Text: () => { throw new Error('boom') } }) },
  }
  await handlerOf('session.start')(faulty, SESSION, async () => ({}))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(await handlerOf('ui.render', { component: 'AbovePrompt' })(faulty, BAND, async () => BENEATH)).toEqual(BENEATH)
})

test('BL-R2 a card re-read of the same binding still running keeps the previous title and AC', async ($, on) => {
  const reads: Record<string, string> = { [A]: CARD }
  const w = world(on, boundToA({ beneath: BENEATH, reads }))
  await started($, w)
  reads[A] = 'defer'
  await $.turn.complete(TURN)
  await w.clock.settle()
  expect(await bandLines($)).toEqual(BOUND_LINES)
})

test('BL-R2 a card read of a different binding still running draws the name alone', async ($, on) => {
  const reads: Record<string, string> = { [A]: CARD }
  const w = world(on, boundToA({ beneath: BENEATH, reads }))
  await started($, w)
  reads['pm/cc-plugins/tasks/b.md'] = 'defer'
  w.files[BIND] = RECORD_A.replace('tasks/a.md', 'tasks/b.md')
  await $.turn.complete(TURN)
  await w.clock.settle()
  expect(await bandLines($)).toEqual(['● b', 'beneath'])
})

test('S-R1 a repeated session start whose card read fails draws the name alone', async ($, on) => {
  const reads: Record<string, string> = { [A]: CARD }
  const w = world(on, boundToA({ beneath: BENEATH, reads }))
  await started($, w)
  delete reads[A]
  await started($, w)
  expect(await bandLines($)).toEqual(['● a', 'beneath'])
})

const TURN = { answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const CARD_DONE = CARD.replace('- [ ] one', '- [x] one')

test('R1 a turn reloads the card so AC follows it', async ($, on) => {
  const reads: Record<string, string> = { [A]: CARD }
  const w = world(on, boundToA({ beneath: BENEATH, reads }))
  await started($, w)
  reads[A] = CARD_DONE
  await $.turn.complete(TURN)
  await w.clock.settle()
  expect((await bandLines($))[0]).toMatch(/AC 1\/1$/)
})

test('RT-R2 a subagent turn reloads nothing', async ($, on) => {
  const reads: Record<string, string> = { [A]: CARD }
  const w = world(on, boundToA({ beneath: BENEATH, reads }))
  await started($, w)
  const before = runsOf(w, 'read').length
  reads[A] = CARD_DONE
  await $.turn.complete({ ...TURN, agentId: 'sub-1' })
  await w.clock.settle()
  expect(runsOf(w, 'read')).toHaveLength(before)
  expect((await bandLines($))[0]).toMatch(/AC 0\/1$/)
})

test('R3 a turn result passes through', async ($, on) => {
  world(on, boundToA())
  expect(await $.turn.complete(TURN)).toEqual({ text: '' })
})

test('R4 a binding file removed between turns clears the band', async ($, on) => {
  const w = world(on, boundToA({ beneath: BENEATH }))
  await started($, w)
  delete w.files[BIND]
  await $.turn.complete(TURN)
  await w.clock.settle()
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('R5 a binding file written between turns shows on the next turn', async ($, on) => {
  const w = world(on, boundToA({ beneath: BENEATH, files: { [CONFIG_PATH]: CONFIG } }))
  await started($, w)
  w.files[BIND] = RECORD_A
  await $.turn.complete(TURN)
  await w.clock.settle()
  expect(await bandLines($)).toEqual(BOUND_LINES)
})

test('R6 a turn whose card re-read fails draws the name alone', async ($, on) => {
  const reads: Record<string, string> = { [A]: CARD }
  const w = world(on, boundToA({ beneath: BENEATH, reads }))
  await started($, w)
  delete reads[A]
  await $.turn.complete(TURN)
  await w.clock.settle()
  expect(await bandLines($)).toEqual(['● a', 'beneath'])
})
