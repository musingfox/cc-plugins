import { describe, expect, test } from 'claude-code/testing'
import { PANE } from './fixtures/pane.ts'
import { CONFIG, SESSION, manifest, world } from './fixtures/world.ts'

// Every string drawn: Text children, Markdown text, Select option values and labels.
function stringsIn(node: any): string[] {
  if (typeof node === 'string') return node === '' ? [] : [node]
  if (!node || typeof node !== 'object') return []
  const options = (node.props?.options ?? []).flatMap((option: any) => [option.value, option.label])
  return [...(node.children ?? []), ...(node.props?.children ?? []), node.props?.text, ...options].flatMap(stringsIn)
}

function nodesOf(node: any, type: string): any[] {
  if (!node || typeof node !== 'object') return []
  const kids = [...(node.children ?? []), ...(node.props?.children ?? [])]
  return [...(node.type === type ? [node] : []), ...kids.flatMap((kid) => nodesOf(kid, type))]
}

async function issue($: any, args: string) {
  await $.session.start(SESSION)
  return $.command.run({ command: 'issue', args })
}

const HOME_MANIFEST = '/Users/u/.claude/plugins/installed_plugins.json'
const CONFIG_PATH = '/work/.obsidian.yaml'
const ROOT = '/Users/u/.claude/plugins/cache/m/viz/1.1.4'
const PRESS = { plugin: 'obw', key: 'open-in-browser' }

// A world where HOME finds one user-scope viz install at ROOT.
function vizWorld(on: any, options: any = {}) {
  return world(on, { env: { HOME: '/Users/u' }, files: { [CONFIG_PATH]: CONFIG, [HOME_MANIFEST]: manifest(ROOT) }, ...options })
}

describe('finding viz', () => {
  test('HOME alone reads the manifest under ~/.claude after the config', async ($, on) => {
    const w = world(on, { env: { HOME: '/Users/u' } })
    await issue($, 'mod-obw-issue-pane')
    expect(w.readCalls).toEqual([CONFIG_PATH, HOME_MANIFEST])
  })

  test('CLAUDE_CONFIG_DIR moves the manifest read', async ($, on) => {
    const w = world(on, { env: { CLAUDE_CONFIG_DIR: '/cfg', HOME: '/Users/u' } })
    await issue($, 'mod-obw-issue-pane')
    expect(w.readCalls).toEqual([CONFIG_PATH, '/cfg/plugins/installed_plugins.json'])
  })

  test('an empty CLAUDE_CONFIG_DIR falls back to HOME', async ($, on) => {
    const w = world(on, { env: { CLAUDE_CONFIG_DIR: '', HOME: '/Users/u' } })
    await issue($, 'mod-obw-issue-pane')
    expect(w.readCalls).toEqual([CONFIG_PATH, HOME_MANIFEST])
  })

  test('an environment that cannot be read reads no manifest and still draws the card', async ($, on) => {
    const w = world(on)
    await issue($, 'mod-obw-issue-pane')
    expect(w.readCalls).toEqual([CONFIG_PATH])
    const tree = await $.ui.render(PANE)
    expect(tree.type).not.toBe('engine')
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
  })

  test('neither variable set reads no manifest', async ($, on) => {
    const w = world(on, { env: {} })
    await issue($, 'mod-obw-issue-pane')
    expect(w.readCalls).toEqual([CONFIG_PATH])
  })

  test('the list alone reads no manifest', async ($, on) => {
    const w = world(on, { env: { HOME: '/Users/u' } })
    await issue($, '')
    expect(w.readCalls).toEqual([CONFIG_PATH])
  })

  test('a card read error reads no manifest', async ($, on) => {
    const w = world(on, { env: { HOME: '/Users/u' }, read: 'Vault not found.' })
    await issue($, 'k')
    expect(w.readCalls).toEqual([CONFIG_PATH])
  })
})

describe('the Open in browser button', () => {
  test('a shown card with viz found carries one Open in browser button', async ($, on) => {
    vizWorld(on)
    await issue($, 'mod-obw-issue-pane')
    const buttons = nodesOf(await $.ui.render(PANE), 'Button')
    expect(buttons.length).toBe(1)
    expect(buttons[0].props.key).toBe('open-in-browser')
    expect(buttons[0].props.label).toBe('Open in browser')
  })

  test('the button is drawn before the card body', async ($, on) => {
    vizWorld(on)
    await issue($, 'mod-obw-issue-pane')
    const drawn = JSON.stringify(await $.ui.render(PANE))
    expect(drawn.indexOf('"type":"Button"')).toBeGreaterThan(-1)
    expect(drawn.indexOf('"type":"Button"')).toBeLessThan(drawn.indexOf('"type":"Markdown"'))
  })

  test('no manifest draws the card without a button that could be pressed', async ($, on) => {
    world(on, { env: { HOME: '/Users/u' } })
    await issue($, 'mod-obw-issue-pane')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Button').length).toBe(0)
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
    await expect($.ui.press(PRESS)).rejects.toThrow()
  })

  test('two viz installs draw no button', async ($, on) => {
    const entry = [{ scope: 'user', installPath: ROOT }]
    const two = JSON.stringify({ version: 2, plugins: { 'viz@a': entry, 'viz@b': entry } })
    vizWorld(on, { files: { [CONFIG_PATH]: CONFIG, [HOME_MANIFEST]: two } })
    await issue($, 'mod-obw-issue-pane')
    expect(nodesOf(await $.ui.render(PANE), 'Button').length).toBe(0)
  })

  test('a manifest that is not JSON draws no button and no engine fallback', async ($, on) => {
    vizWorld(on, { files: { [CONFIG_PATH]: CONFIG, [HOME_MANIFEST]: 'not json' } })
    await issue($, 'mod-obw-issue-pane')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Button').length).toBe(0)
    expect(tree.type).not.toBe('engine')
  })

  test('an environment that cannot be read draws no button', async ($, on) => {
    world(on)
    await issue($, 'mod-obw-issue-pane')
    expect(nodesOf(await $.ui.render(PANE), 'Button').length).toBe(0)
  })

  test('the list alone draws no button', async ($, on) => {
    vizWorld(on)
    await issue($, '')
    expect(nodesOf(await $.ui.render(PANE), 'Button').length).toBe(0)
  })
})
