import { expect, test } from 'claude-code/testing'
import { BAND, bandLines } from './fixtures/band.ts'
import { CONFIG_PATH, PANE, actionButtons, issue, mounted, nodesOf, press, shown, stringsIn } from './fixtures/pane.ts'
import { CONFIG, world } from './fixtures/world.ts'
import { ERROR as RED } from '../hooks/style.ts'

const BIND = '/Users/u/.claude-mobile/launches/sid-1.json'
const CARD_PATH = 'pm/cc-plugins/tasks/mod-obw-issue-pane.md'
const BENEATH = { type: 'Text', children: ['beneath'], part: { plugin: 'test' } }
const rows = (...paths: string[]) => JSON.stringify(paths.map((path) => ({ path, status: 'todo' })))
const record = (extra = '', cardPath = CARD_PATH, vault = 'obsidian') => `{"cardPath":"${cardPath}","vault":"${vault}","project":"cc-plugins",${extra}"createdAt":"2026-10-07T00:00:00.000Z"}`

const base = (options: any = {}) => ({ env: { HOME: '/Users/u' }, sessionId: 'sid-1', query: rows(CARD_PATH), beneath: BENEATH, ...options })
const buttons = (tree: any) => nodesOf(tree, 'Button')
const keys = (tree: any) => buttons(tree).map((node: any) => node.props.key)

const boundToCard = (extra: any = {}) => base({ files: { [CONFIG_PATH]: CONFIG, [BIND]: record() }, ...extra })
const boundCard = async ($: any, on: any, options: any = {}) => {
  const w = world(on, boundToCard(options))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await w.clock.settle()
  await shown($, w, 'mod-obw-issue-pane')
  return w
}
const COULD_NOT_UNBIND = (tree: any) => stringsIn(tree).filter((text) => text.startsWith('Could not unbind: '))

test('U1 the bound card offers work then Unbind this session', async ($, on) => {
  await boundCard($, on)
  const tree = await $.ui.render(PANE)
  expect(actionButtons(tree).map((node: any) => node.props.key)).toEqual(['work', 'unbind'])
  expect(actionButtons(tree)[1].props.label).toBe('Unbind this session')
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
  expect(keys(tree)).toContain('work')
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
