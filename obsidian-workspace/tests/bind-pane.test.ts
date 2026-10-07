import { expect, test } from 'claude-code/testing'
import { BAND, bandLines } from './fixtures/band.ts'
import { CONFIG_PATH, PANE, issue, mounted, nodesOf, openFirstRow, press, shown, stringsIn } from './fixtures/pane.ts'
import { CONFIG, world } from './fixtures/world.ts'
import { RED } from '../hooks/style.ts'

const BIND = '/Users/u/.claude-mobile/launches/sid-1.json'
const CARD_PATH = 'pm/cc-plugins/tasks/mod-obw-issue-pane.md'
const BENEATH = { type: 'Text', children: ['beneath'] }
const rows = (...paths: string[]) => JSON.stringify(paths.map((path) => ({ path, status: 'todo' })))
const TITLE = 'Claude Mod：面板顯示 obw 的 task 與 issue'
const record = (extra = '', cardPath = CARD_PATH, vault = 'obsidian') => `{"cardPath":"${cardPath}","vault":"${vault}","project":"cc-plugins",${extra}"createdAt":"2026-10-07T00:00:00.000Z"}`

const base = (options: any = {}) => ({ env: { HOME: '/Users/u' }, sessionId: 'sid-1', query: rows(CARD_PATH), beneath: BENEATH, ...options })
const buttons = (tree: any) => nodesOf(tree, 'Button')
const keys = (tree: any) => buttons(tree).map((node: any) => node.props.key)

async function shownCard($: any, on: any, options: any = {}) {
  const w = world(on, base(options))
  await shown($, w, 'mod-obw-issue-pane')
  return w
}

test('B1 an argument card on the terminal offers Bind this session', async ($, on) => {
  await shownCard($, on)
  const tree = await $.ui.render(PANE)
  expect(buttons(tree).filter((node: any) => node.props.key === 'bind')).toHaveLength(1)
  expect(buttons(tree).find((node: any) => node.props.key === 'bind').props.label).toBe('Bind this session')
  expect(keys(tree)).not.toContain('unbind')
})

test('B2 pressing bind writes the binding and shows it', async ($, on) => {
  const w = await shownCard($, on)
  await press($, w, 'bind')
  expect(w.writes).toHaveLength(1)
  expect(w.writes[0].path).toBe(BIND)
  expect(JSON.parse(w.writes[0].text)).toEqual({ cardPath: CARD_PATH, vault: 'obsidian', project: 'cc-plugins', createdAt: '1970-01-01T00:00:00.000Z' })
  expect(keys(await $.ui.render(PANE))).toContain('unbind')
  expect(await bandLines($)).toEqual([`● mod-obw-issue-pane  ${TITLE}  AC 0/1`, 'beneath'])
})

test('B3 the desktop offers no bind button', async ($, on) => {
  await shownCard($, on)
  expect(keys(await $.ui.render({ ...PANE, surface: 'desktop' }))).not.toContain('bind')
})

test('B4 a card opened from the list offers no bind button', async ($, on) => {
  const w = world(on, base())
  await openFirstRow($, w)
  expect(keys(await $.ui.render(PANE))).not.toContain('bind')
})

test('B5 a failed card read offers no bind button', async ($, on) => {
  await shownCard($, on, { read: 'Vault not found.' })
  expect(keys(await $.ui.render(PANE))).not.toContain('bind')
})

const COULD_NOT_BIND = (tree: any) => stringsIn(tree).filter((text) => text.startsWith('Could not bind: '))

test('B6 a denied write says so in red and binds nothing', async ($, on) => {
  const w = await shownCard($, on, { write: { deny: 'EACCES' } })
  await press($, w, 'bind')
  const tree = await $.ui.render(PANE)
  expect(COULD_NOT_BIND(tree)).toHaveLength(1)
  expect(nodesOf(tree, 'Text').find((node: any) => stringsIn(node)[0]?.startsWith('Could not bind: ')).props.color).toBe(RED)
  expect(keys(tree)).not.toContain('unbind')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
})

test('B7 without OBW_LAUNCHES_DIR or HOME nothing is written', async ($, on) => {
  const w = await shownCard($, on, { env: {} })
  await press($, w, 'bind')
  expect(COULD_NOT_BIND(await $.ui.render(PANE))).toEqual(['Could not bind: neither OBW_LAUNCHES_DIR nor HOME is set.'])
  expect(w.writes).toEqual([])
})

test('B-R1 a relative OBW_LAUNCHES_DIR is named as not absolute and nothing is written', async ($, on) => {
  const w = await shownCard($, on, { env: { HOME: '/Users/u', OBW_LAUNCHES_DIR: 'rel' } })
  await press($, w, 'bind')
  expect(COULD_NOT_BIND(await $.ui.render(PANE))).toEqual(['Could not bind: OBW_LAUNCHES_DIR or HOME is not an absolute path.'])
  expect(w.writes).toEqual([])
})

test('B8 without a session id nothing is written', async ($, on) => {
  const w = await shownCard($, on, { sessionId: undefined })
  await press($, w, 'bind')
  expect(COULD_NOT_BIND(await $.ui.render(PANE))).toHaveLength(1)
  expect(w.writes).toEqual([])
})

test('B9 OBW_LAUNCHES_DIR moves the binding file', async ($, on) => {
  const w = await shownCard($, on, { env: { HOME: '/Users/u', OBW_LAUNCHES_DIR: '/alt' } })
  await press($, w, 'bind')
  expect(w.writes.map((write: any) => write.path)).toEqual(['/alt/sid-1.json'])
})

test('B10 opening the card again drops the failure line', async ($, on) => {
  const w = await shownCard($, on, { write: { deny: 'EACCES' } })
  await press($, w, 'bind')
  expect(COULD_NOT_BIND(await $.ui.render(PANE))).toHaveLength(1)
  await shown($, w, 'mod-obw-issue-pane')
  expect(COULD_NOT_BIND(await $.ui.render(PANE))).toEqual([])
})

const boundToCard = (extra: any = {}) => base({ files: { [CONFIG_PATH]: CONFIG, [BIND]: record() }, ...extra })
const boundCard = async ($: any, on: any, options: any = {}) => {
  const w = world(on, boundToCard(options))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await w.clock.settle()
  await shown($, w, 'mod-obw-issue-pane')
  return w
}
const COULD_NOT_UNBIND = (tree: any) => stringsIn(tree).filter((text) => text.startsWith('Could not unbind: '))

test('U1 the bound card offers bind then Unbind this session', async ($, on) => {
  await boundCard($, on)
  const tree = await $.ui.render(PANE)
  expect(keys(tree)).toEqual(['bind', 'unbind'])
  expect(buttons(tree)[1].props.label).toBe('Unbind this session')
})

test('U2 pressing unbind removes the binding file and the band line', async ($, on) => {
  const w = await boundCard($, on)
  await press($, w, 'unbind')
  expect(w.runs.map((run: any) => run.argv)).toContainEqual(['rm', '-f', BIND])
  expect(keys(await $.ui.render(PANE))).not.toContain('unbind')
  expect(await $.ui.render(BAND)).toEqual(BENEATH)
  expect(BIND in w.files).toBe(false)
})

test('U3 another bound card offers no unbind', async ($, on) => {
  await boundCard($, on, { files: { [CONFIG_PATH]: CONFIG, [BIND]: record('', 'pm/cc-plugins/tasks/b.md') } })
  const tree = await $.ui.render(PANE)
  expect(keys(tree)).toContain('bind')
  expect(keys(tree)).not.toContain('unbind')
})

test('U4 a binding in another vault offers no unbind', async ($, on) => {
  await boundCard($, on, { files: { [CONFIG_PATH]: CONFIG, [BIND]: record('', CARD_PATH, 'other') } })
  expect(keys(await $.ui.render(PANE))).not.toContain('unbind')
})

test('U5 a cc-mobile binding can be unbound', async ($, on) => {
  const w = await boundCard($, on, { files: { [CONFIG_PATH]: CONFIG, [BIND]: record('"paneId":"%12",') } })
  await press($, w, 'unbind')
  expect(w.runs.map((run: any) => run.argv)).toContainEqual(['rm', '-f', BIND])
})

test('U6 a failed rm says why in red and keeps the binding', async ($, on) => {
  const stderr = 'rm: /Users/u/.claude-mobile/launches/sid-1.json: Permission denied\n'
  const w = await boundCard($, on, { rm: { exitCode: 1, stderr } })
  await press($, w, 'unbind')
  const tree = await $.ui.render(PANE)
  expect(COULD_NOT_UNBIND(tree)).toEqual([`Could not unbind: ${stderr.trim()}`])
  expect(nodesOf(tree, 'Text').find((node: any) => stringsIn(node)[0]?.startsWith('Could not unbind: ')).props.color).toBe(RED)
  expect(keys(tree)).toContain('unbind')
  expect((await bandLines($))[0]).toMatch(/^● mod-obw-issue-pane/)
})

test('U7 a rejected rm says it did not run', async ($, on) => {
  const w = await boundCard($, on, { rm: { deny: 'spawn failed' } })
  await press($, w, 'unbind')
  expect(COULD_NOT_UNBIND(await $.ui.render(PANE))).toEqual(['Could not unbind: rm did not run.'])
})

test('U8 a failed rm without stderr names its exit code', async ($, on) => {
  const w = await boundCard($, on, { rm: { exitCode: 1 } })
  await press($, w, 'unbind')
  expect(COULD_NOT_UNBIND(await $.ui.render(PANE))).toEqual(['Could not unbind: rm exited 1'])
})

test('U9 OBW_LAUNCHES_DIR moves the file unbind removes', async ($, on) => {
  const w = await boundCard($, on, { env: { HOME: '/Users/u', OBW_LAUNCHES_DIR: '/alt' }, files: { [CONFIG_PATH]: CONFIG, '/alt/sid-1.json': record() } })
  await press($, w, 'unbind')
  expect(w.runs.map((run: any) => run.argv)).toContainEqual(['rm', '-f', '/alt/sid-1.json'])
})

// world.ts snapshots its `env` option at registration, so a test that changes the environment after load answers env.get itself.
const unbindWithEnv = async ($: any, on: any, later: Record<string, string>) => {
  const env: Record<string, string> = { HOME: '/Users/u' }
  on('env.get', ($: any, e: any) => ({ value: env[e.name] }))
  const w = world(on, { ...boundToCard(), env: undefined })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await w.clock.settle()
  await shown($, w, 'mod-obw-issue-pane')
  for (const name of Object.keys(env)) delete env[name]
  Object.assign(env, later)
  await press($, w, 'unbind')
  return { w, tree: await $.ui.render(PANE) }
}

test('U10 a relative OBW_LAUNCHES_DIR is named as not absolute and nothing is removed', async ($, on) => {
  const { w, tree } = await unbindWithEnv($, on, { HOME: '/Users/u', OBW_LAUNCHES_DIR: 'rel' })
  expect(COULD_NOT_UNBIND(tree)).toEqual(['Could not unbind: OBW_LAUNCHES_DIR or HOME is not an absolute path.'])
  expect(w.runs.filter((run: any) => run.argv[0] === 'rm')).toEqual([])
  expect(keys(tree)).toContain('unbind')
})

test('U11 without OBW_LAUNCHES_DIR or HOME nothing is removed', async ($, on) => {
  const { w, tree } = await unbindWithEnv($, on, {})
  expect(COULD_NOT_UNBIND(tree)).toEqual(['Could not unbind: neither OBW_LAUNCHES_DIR nor HOME is set.'])
  expect(w.runs.filter((run: any) => run.argv[0] === 'rm')).toEqual([])
  expect(keys(tree)).toContain('unbind')
})
