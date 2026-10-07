import { expect, test } from 'claude-code/testing'
import { BAND, bandLines, handlerOf } from './fixtures/band.ts'
import { SESSION, world } from './fixtures/world.ts'

const BIND = '/Users/u/.claude-mobile/launches/sid-1.json'
const BENEATH = { type: 'Text', children: ['beneath'] }
const SET = (value: string) => `Set status: ${value}\n`
const SET_IN_PROGRESS_VIA_VARS = 'V=obsidian; P="pm/cc-plugins/tasks/mod-obw-bind-and-band.md"\ntimeout 20 obsidian vault=$V property:set name=status value=in-progress path="$P" | cat'
const setIn = (path: string, value = 'in-progress') => `obsidian vault=obsidian property:set name=status value=${value} path="pm/cc-plugins/tasks/${path}.md" | cat`
const ok = (stdout: string) => ({ result: { stdout, stderr: '', interrupted: false }, text: stdout })

// A world with the HOME and session id the binding path needs; `answer` is what Bash returns to the hook.
async function bash($: any, on: any, command: string, answer: unknown, options: any = {}) {
  const w = world(on, { env: { HOME: '/Users/u' }, sessionId: 'sid-1', beneath: BENEATH, ...options })
  on('tool.call', { tool: 'Bash' }, () => answer)
  await $.session.start(SESSION)
  await w.clock.settle()
  const result = await $.tool.call({ tool: 'Bash', command })
  await w.clock.settle()
  return { w, result }
}

test('AB1 a confirmed in-progress change binds the session', async ($, on) => {
  const { w } = await bash($, on, SET_IN_PROGRESS_VIA_VARS, ok(SET('in-progress')))
  expect(w.writes).toHaveLength(1)
  expect(w.writes[0].path).toBe(BIND)
  expect(w.writes[0].text.endsWith('\n')).toBe(true)
  expect(JSON.parse(w.writes[0].text)).toEqual({ cardPath: 'pm/cc-plugins/tasks/mod-obw-bind-and-band.md', vault: 'obsidian', project: 'cc-plugins', createdAt: '1970-01-01T00:00:00.000Z' })
  expect((await bandLines($))[0]).toMatch(/^● mod-obw-bind-and-band/)
})

test('AB2 an error on stdout binds nothing', async ($, on) => {
  const { w } = await bash($, on, SET_IN_PROGRESS_VIA_VARS, ok('Error: File "pm/cc-plugins/tasks/mod-obw-bind-and-band.md" not found.\n'))
  expect(w.writes).toEqual([])
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('AB3 a file target reads the config', async ($, on) => {
  const { w } = await bash($, on, 'obsidian property:set name=status value=in-progress file=a | cat', ok(SET('in-progress')))
  expect(w.readCalls).toContain('/work/.obsidian.yaml')
  expect(JSON.parse(w.writes[0].text)).toEqual({ cardPath: 'pm/cc-plugins/tasks/a.md', vault: 'obsidian', project: 'cc-plugins', createdAt: '1970-01-01T00:00:00.000Z' })
})

test('AB4 a vault in the command wins and the config is not read', async ($, on) => {
  const { w } = await bash($, on, 'obsidian vault=other property:set name=status value=in-progress path=pm/proj/tasks/y.md', ok('Set status: in-progress'))
  expect(JSON.parse(w.writes[0].text)).toEqual({ cardPath: 'pm/proj/tasks/y.md', vault: 'other', project: 'proj', createdAt: '1970-01-01T00:00:00.000Z' })
  expect(w.readCalls).not.toContain('/work/.obsidian.yaml')
})

test('AB5 the text alone confirms the change', async ($, on) => {
  const { w } = await bash($, on, SET_IN_PROGRESS_VIA_VARS, { result: {}, text: 'Set status: in-progress' })
  expect(w.writes.map((write: any) => write.path)).toEqual([BIND])
})

test('AB6 a subagent call binds too', async ($, on) => {
  const w = world(on, { env: { HOME: '/Users/u' }, sessionId: 'sid-1', beneath: BENEATH })
  on('tool.call', { tool: 'Bash' }, () => ok(SET('in-progress')))
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Bash', command: SET_IN_PROGRESS_VIA_VARS, agentId: 'sub-1' })
  await w.clock.settle()
  expect(w.writes.map((write: any) => write.path)).toEqual([BIND])
})

test('AB7 an unrelated command does no I/O', async ($, on) => {
  const w = world(on, { env: { HOME: '/Users/u' }, sessionId: 'sid-1', beneath: BENEATH })
  on('tool.call', { tool: 'Bash' }, () => ok('total 0\n'))
  await $.session.start(SESSION)
  await w.clock.settle()
  const counts = [w.existsCalls.length, w.readCalls.length, w.runs.length, w.writes.length]
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  await w.clock.settle()
  expect([w.existsCalls.length, w.readCalls.length, w.runs.length, w.writes.length]).toEqual(counts)
})

test('AB8 a background run binds nothing', async ($, on) => {
  const { w } = await bash($, on, SET_IN_PROGRESS_VIA_VARS, { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, text: 'Command running in background with ID: b1' })
  expect(w.writes).toEqual([])
})

test('AB9 the later change replaces the earlier binding', async ($, on) => {
  const w = world(on, { env: { HOME: '/Users/u' }, sessionId: 'sid-1', beneath: BENEATH })
  on('tool.call', { tool: 'Bash' }, () => ok(SET('in-progress')))
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'Bash', command: setIn('a') })
  await w.clock.settle()
  await $.tool.call({ tool: 'Bash', command: setIn('b') })
  await w.clock.settle()
  expect(JSON.parse(w.writes.at(-1).text).cardPath).toBe('pm/cc-plugins/tasks/b.md')
  expect((await bandLines($))[0]).toMatch(/^● b/)
})

test('AB10 an error result that still printed the confirmation binds', async ($, on) => {
  const { w } = await bash($, on, SET_IN_PROGRESS_VIA_VARS, { isError: true, result: { stdout: SET('in-progress'), stderr: '', interrupted: false }, text: `${SET('in-progress')}Exit code 1` })
  expect(w.writes.map((write: any) => write.path)).toEqual([BIND])
})

test('AB11 OBW_LAUNCHES_DIR moves the binding file', async ($, on) => {
  const { w } = await bash($, on, SET_IN_PROGRESS_VIA_VARS, ok(SET('in-progress')), { env: { HOME: '/Users/u', OBW_LAUNCHES_DIR: '/alt' } })
  expect(w.writes.map((write: any) => write.path)).toEqual(['/alt/sid-1.json'])
})
