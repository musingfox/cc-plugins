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

async function issue($: any, args: string) {
  await $.session.start(SESSION)
  return $.command.run({ command: 'issue', args })
}

async function paneStrings($: any) {
  return stringsIn(await $.ui.render(PANE))
}

describe('command registration', () => {
  test('session start registers /issue', async ($, on) => {
    const w = world(on)
    expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
    expect(w.registered[0]).toEqual({
      name: 'issue',
      description: 'Show an obw task card in a pane',
      argumentHint: '[card]',
      immediate: true,
    })
  })

  test('a refused registration does not stop the session', async ($, on) => {
    world(on, { register: { deny: 'taken' } })
    expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
  })
})

describe('pane', () => {
  test('/issue opens the obw issue pane', async ($, on) => {
    const w = world(on)
    await issue($, '')
    expect(w.opened[0]).toEqual({ id: 'obw-issue', title: 'obw issue', focus: true, closeOnEscape: true })
  })

  test('a refused pane is one transcript line and nothing is read', async ($, on) => {
    const w = world(on, { open: { deny: 'no' } })
    expect(await issue($, '')).toEqual({ text: 'obw: the /issue pane could not open.' })
    expect(w.runs).toEqual([])
    expect(w.existsCalls).toEqual([])
    expect(w.readCalls).toEqual([])
  })
})

describe('command result', () => {
  test('a shown list returns an empty result', async ($, on) => {
    const w = world(on)
    expect(await issue($, '')).toEqual({})
    expect(w.runs.length).toBe(1)
  })

  test('a shown card returns an empty result with no card text', async ($, on) => {
    const w = world(on, { search: '["pm/cc-plugins/tasks/mod-obw-issue-pane.md"]' })
    const result = await issue($, 'mod-obw-issue-pane')
    expect(result).toEqual({})
    expect(JSON.stringify(result).includes('Acceptance Criteria')).toBe(false)
    expect(w.runs.length).toBe(2)
  })

  test('a search error returns an empty result', async ($, on) => {
    const w = world(on, { search: 'Vault not found.' })
    expect(await issue($, '')).toEqual({})
    expect(w.runs.length).toBe(1)
  })

  test('a refused card name returns an empty result', async ($, on) => {
    world(on)
    expect(await issue($, 'a/b')).toEqual({})
  })

  test('a missing config returns an empty result', async ($, on) => {
    world(on, { files: {} })
    expect(await issue($, '')).toEqual({})
  })
})

describe('config', () => {
  test('the .obsidian.yaml nearest the cwd wins', async ($, on) => {
    const w = world(on, {
      cwd: '/w/sub',
      files: {
        '/w/sub/.obsidian.yaml': 'vault: inner\npm:\n  project: p\n',
        '/w/.obsidian.yaml': 'vault: outer\npm:\n  project: p\n',
      },
      search: '[]',
    })
    await issue($, '')
    expect(w.runs[0].argv[1]).toBe('vault=inner')
    expect(w.readCalls).toEqual(['/w/sub/.obsidian.yaml'])
  })

  test('with no .obsidian.yaml up to / the pane says so and nothing runs', async ($, on) => {
    const w = world(on, { cwd: '/w/sub', files: {} })
    await issue($, '')
    expect(w.existsCalls).toEqual(['/w/sub/.obsidian.yaml', '/w/.obsidian.yaml', '/.obsidian.yaml'])
    expect(await paneStrings($)).toContain('No .obsidian.yaml in /w/sub or any directory above it.')
    expect(w.runs).toEqual([])
  })

  test('a config without pm.project is named in the pane', async ($, on) => {
    const w = world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': 'vault: v\n' } })
    await issue($, '')
    expect(await paneStrings($)).toContain('/w/.obsidian.yaml has no pm.project.')
    expect(w.runs).toEqual([])
  })

  test('a config without vault is named in the pane', async ($, on) => {
    world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': 'pm:\n  project: p\n' } })
    await issue($, '')
    expect(await paneStrings($)).toContain('/w/.obsidian.yaml has no vault.')
  })

  test('a config with neither key is named in the pane', async ($, on) => {
    world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': 'note: {}\n' } })
    await issue($, '')
    expect(await paneStrings($)).toContain('/w/.obsidian.yaml has no vault or pm.project.')
  })

  test('an unreadable config is named in the pane', async ($, on) => {
    world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': { deny: 'x' } } })
    await issue($, '')
    expect(await paneStrings($)).toContain('Could not read /w/.obsidian.yaml.')
  })

  test('a project that is not one folder under pm/ is refused before any run', async ($, on) => {
    const w = world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': 'vault: v\npm:\n  project: a/b\n' } })
    await issue($, '')
    expect(await paneStrings($)).toContain('/w/.obsidian.yaml: pm.project "a/b" cannot name a folder under pm/.')
    expect(w.runs).toEqual([])
  })

  test('a config at the filesystem root is named without a doubled slash', async ($, on) => {
    world(on, { cwd: '/', files: { '/.obsidian.yaml': 'vault: v\n' } })
    await issue($, '')
    expect(await paneStrings($)).toContain('/.obsidian.yaml has no pm.project.')
  })

  test('a failed existence check is shown, not taken for a missing file', async ($, on) => {
    const w = world(on, { exists: { deny: 'host refused' } })
    await issue($, '')
    const strings = await paneStrings($)
    expect(strings.some((s) => s.startsWith('Could not look for .obsidian.yaml: '))).toBe(true)
    expect(strings.some((s) => s.startsWith('No .obsidian.yaml'))).toBe(false)
    expect(w.runs).toEqual([])
  })
})

describe('bad card argument', () => {
  test('a slash card name is refused before config lookup', async ($, on) => {
    const w = world(on)
    await issue($, 'a/b')
    expect(w.runs).toEqual([])
    expect(w.existsCalls).toEqual([])
    expect(await paneStrings($)).toContain('"a/b" is not a card name.')
  })

  test('a dot-dot card name is refused', async ($, on) => {
    const w = world(on)
    await issue($, '..')
    expect(w.runs).toEqual([])
    expect(await paneStrings($)).toContain('".." is not a card name.')
  })

  test('a bad card name is refused even without a config', async ($, on) => {
    world(on, { files: {} })
    await issue($, 'a/b')
    expect(await paneStrings($)).toContain('"a/b" is not a card name.')
  })
})
