import { describe, expect, test } from 'claude-code/testing'
import { PANE } from './fixtures/pane.ts'
import { SESSION, world } from './fixtures/world.ts'

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
