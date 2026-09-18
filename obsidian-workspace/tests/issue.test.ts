import { describe, expect, test } from 'claude-code/testing'
import { PANE } from './fixtures/pane.ts'
import { CARD, SEARCH_ARGV, SESSION, world } from './fixtures/world.ts'

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

  test('spaces around a card name are trimmed and the name is read', async ($, on) => {
    const w = world(on, { search: '["pm/cc-plugins/tasks/ok-card.md"]' })
    await issue($, '  ok-card ')
    expect(w.runs[1].argv[3]).toBe('path=pm/cc-plugins/tasks/ok-card.md')
  })
})

describe('list', () => {
  test('unfinished cards are one scoped search drawn as a Select', async ($, on) => {
    const w = world(on, { search: '["pm/cc-plugins/tasks/a.md","pm/cc-plugins/tasks/b.md"]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(w.runs.length).toBe(1)
    expect(w.runs[0].argv).toEqual(SEARCH_ARGV)
    expect(w.runs[0].init.timeoutMs).toBe(10000)
    const selects = nodesOf(tree, 'Select')
    expect(selects.length).toBe(1)
    expect(selects[0].props.options).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
    ])
    expect(selects[0].props.value).toBe(undefined)
    expect(w.invalidates >= 1).toBe(true)
  })

  test('drawing the pane again runs nothing', async ($, on) => {
    const w = world(on, { search: '["pm/cc-plugins/tasks/a.md","pm/cc-plugins/tasks/b.md"]' })
    await issue($, '')
    await $.ui.render(PANE)
    await $.ui.render(PANE)
    await $.ui.render(PANE)
    expect(w.runs.length).toBe(1)
  })

  test('no unfinished cards is said in text, with no Select', async ($, on) => {
    world(on, { search: 'No matches found.\n' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select').length).toBe(0)
    expect(stringsIn(tree)).toContain('No unfinished cards in pm/cc-plugins.')
  })

  test('an unknown vault is shown as the CLI printed it', async ($, on) => {
    world(on, { search: 'Vault not found.\n' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select').length).toBe(0)
    expect(stringsIn(tree)).toContain('Vault not found.')
  })

  test('output of no known shape is shown as printed', async ($, on) => {
    world(on, { search: 'garbage' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select').length).toBe(0)
    expect(stringsIn(tree)).toContain('garbage')
  })

  test('a CLI that did not run is said so', async ($, on) => {
    world(on, { search: { deny: 'spawn failed' } })
    await issue($, '')
    expect(await paneStrings($)).toContain(
      'The obsidian CLI did not run: it is not on PATH, or it did not answer within 10 s.',
    )
  })

  test('duplicate and archived paths leave one option each', async ($, on) => {
    world(on, {
      search: '["pm/cc-plugins/tasks/a.md","pm/cc-plugins/tasks/a.md","pm/cc-plugins/tasks/archive/c.md"]',
    })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(tree.type).not.toBe('engine')
    expect(nodesOf(tree, 'Select')[0].props.options).toEqual([{ value: 'a', label: 'a' }])
  })

  test('the pane reads "Reading the vault…" while the search runs', async ($, on) => {
    const w = world(on, { search: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    const loading = await $.ui.render(PANE)
    expect(w.runs.length).toBe(1)
    expect(stringsIn(loading)).toEqual(['Reading the vault…'])
    await w.clock.advance(60000)
    await done
    expect(nodesOf(await $.ui.render(PANE), 'Select').length).toBe(1)
  })
})

describe('card', () => {
  test('/issue <card> draws the header and body below the preselected list', async ($, on) => {
    const w = world(on, {
      search: '["pm/cc-plugins/tasks/mod-obw-issue-pane.md","pm/cc-plugins/tasks/other.md"]',
      read: CARD,
    })
    await issue($, 'mod-obw-issue-pane')
    const tree = await $.ui.render(PANE)
    expect(w.runs.map((run: any) => run.argv)).toEqual([
      SEARCH_ARGV,
      ['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/mod-obw-issue-pane.md'],
    ])
    const select = nodesOf(tree, 'Select')[0]
    expect(select.props.value).toBe('mod-obw-issue-pane')
    const strings = stringsIn(tree)
    expect(strings).toContain('Claude Mod：面板顯示 obw 的 task 與 issue')
    expect(strings).toContain('status: todo · priority: medium')
    const markdowns = nodesOf(tree, 'Markdown')
    expect(markdowns.length).toBe(1)
    expect(markdowns[0].props.text).toBe('# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n')
    const flat = JSON.stringify(tree)
    expect(flat.indexOf('"type":"Select"') < flat.indexOf('"type":"Markdown"')).toBe(true)
  })

  test('a missing card is a message under the list, with no body', async ($, on) => {
    world(on, { read: 'Error: File "pm/cc-plugins/tasks/nope.md" not found.\n' })
    await issue($, 'nope')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select').length).toBe(1)
    expect(stringsIn(tree)).toContain('Error: File "pm/cc-plugins/tasks/nope.md" not found.')
    expect(nodesOf(tree, 'Markdown').length).toBe(0)
  })

  test('a card outside the list is still preselected without breaking the pane', async ($, on) => {
    world(on, {
      search: '["pm/cc-plugins/tasks/a.md","pm/cc-plugins/tasks/b.md"]',
      read: 'Error: File "pm/cc-plugins/tasks/zzz.md" not found.\n',
    })
    await issue($, 'zzz')
    const tree = await $.ui.render(PANE)
    expect(tree.type).not.toBe('engine')
    expect(nodesOf(tree, 'Select')[0].props.value).toBe('zzz')
  })

  test('an unknown vault on read is a message, with no body', async ($, on) => {
    world(on, { read: 'Vault not found.' })
    await issue($, 'k')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Markdown').length).toBe(0)
    expect(stringsIn(tree)).toContain('Vault not found.')
  })

  test('a closed app on the search is the only message, and nothing is read', async ($, on) => {
    const closed = 'The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.'
    const w = world(on, { search: { exitCode: 1, stdout: '', stderr: `${closed}\n` } })
    await issue($, 'k')
    const tree = await $.ui.render(PANE)
    expect(w.runs.length).toBe(1)
    expect(stringsIn(tree)).toContain(closed)
    expect(nodesOf(tree, 'Select').length).toBe(0)
    expect(nodesOf(tree, 'Markdown').length).toBe(0)
  })

  test('a card missing from the unfinished list still draws below the empty notice', async ($, on) => {
    world(on, { search: 'No matches found.', read: CARD })
    await issue($, 'done-card')
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).toContain('No unfinished cards in pm/cc-plugins.')
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
  })

  test('a card without title, or priority, falls back to its name and a dash', async ($, on) => {
    world(on, { read: '---\nstatus: todo\n---\nbody\n' })
    await issue($, 'k')
    const tree = await $.ui.render(PANE)
    const title = nodesOf(tree, 'Text').filter((node: any) => node.props?.bold)
    expect(stringsIn(title[0])).toEqual(['k'])
    expect(stringsIn(tree)).toContain('status: todo · priority: —')
  })

  test('the card region reads "Reading <card>…" while the read runs', async ($, on) => {
    const w = world(on, { search: '["pm/cc-plugins/tasks/mod-obw-issue-pane.md"]', read: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: 'mod-obw-issue-pane' })
    await w.clock.settle()
    const loading = await $.ui.render(PANE)
    expect(w.runs.length).toBe(2)
    expect(nodesOf(loading, 'Select').length).toBe(1)
    expect(stringsIn(loading)).toContain('Reading mod-obw-issue-pane…')
    await w.clock.advance(60000)
    await done
  })
})

describe('overlapping requests', () => {
  const cardTitled = (title: string) => `---\ntitle: ${title}\n---\nbody of ${title}\n`

  test('a card read that settles after a newer card read leaves the newer card drawn', async ($, on) => {
    const w = world(on, { search: '["pm/cc-plugins/tasks/a.md","pm/cc-plugins/tasks/b.md"]', read: 'defer' })
    await $.session.start(SESSION)
    const first = $.command.run({ command: 'issue', args: 'a' })
    await w.clock.settle()
    const second = $.command.run({ command: 'issue', args: 'b' })
    await w.clock.settle()
    expect(w.runs.map((run: any) => run.argv[3])).toEqual([
      SEARCH_ARGV[3],
      'path=pm/cc-plugins/tasks/a.md',
      SEARCH_ARGV[3],
      'path=pm/cc-plugins/tasks/b.md',
    ])
    w.release(3, cardTitled('Card B'))
    await w.clock.settle()
    w.release(1, cardTitled('Card A'))
    await Promise.all([first, second])
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select')[0].props.value).toBe('b')
    const strings = stringsIn(tree)
    expect(strings).toContain('Card B')
    expect(strings).not.toContain('Card A')
    expect(nodesOf(tree, 'Markdown')[0].props.text).toBe('body of Card B\n')
  })

  test('a search that settles after a newer /issue leaves the newer list drawn and reads nothing', async ($, on) => {
    const w = world(on, { search: 'defer' })
    await $.session.start(SESSION)
    const first = $.command.run({ command: 'issue', args: 'a' })
    await w.clock.settle()
    const second = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    expect(w.runs.length).toBe(2)
    w.release(1, '["pm/cc-plugins/tasks/b.md"]')
    await second
    w.release(0, '["pm/cc-plugins/tasks/a.md"]')
    await first
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select')[0].props.options).toEqual([{ value: 'b', label: 'b' }])
    expect(nodesOf(tree, 'Select')[0].props.value).toBe(undefined)
    expect(stringsIn(tree)).toEqual(['b', 'b'])
    expect(w.runs.length).toBe(2)
  })

  test('a card read started by an earlier /issue does not land in a newer one', async ($, on) => {
    const w = world(on, { search: 'defer', read: 'defer' })
    await $.session.start(SESSION)
    const first = $.command.run({ command: 'issue', args: 'a' })
    await w.clock.settle()
    w.release(0, '["pm/cc-plugins/tasks/a.md"]')
    await w.clock.settle()
    expect(w.runs[1].argv[3]).toBe('path=pm/cc-plugins/tasks/a.md')
    const second = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    w.release(2, '["pm/cc-plugins/tasks/b.md"]')
    await second
    w.release(1, cardTitled('Card A'))
    await first
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select')[0].props.options).toEqual([{ value: 'b', label: 'b' }])
    expect(nodesOf(tree, 'Select')[0].props.value).toBe(undefined)
    expect(stringsIn(tree)).toEqual(['b', 'b'])
    expect(nodesOf(tree, 'Markdown').length).toBe(0)
  })
})

describe('bounded drawing', () => {
  const ESC = String.fromCharCode(27)
  const CR = String.fromCharCode(13)
  const DRAWABLE = /^[^\x00-\x08\x0b-\x1f\x7f-\x9f]*$/

  test('a body over 10000 characters is clipped with a notice', async ($, on) => {
    world(on, { read: `---\ntitle: t\n---\n${'x'.repeat(11000)}` })
    await issue($, 'k')
    const tree = await $.ui.render(PANE)
    expect(tree.type).not.toBe('engine')
    expect(nodesOf(tree, 'Markdown')[0].props.text.length).toBe(10000)
    expect(stringsIn(tree)).toContain('Clipped: showing 10000 of 11000 characters.')
  })

  test('a body of exactly 10000 characters has no notice', async ($, on) => {
    world(on, { read: `---\ntitle: t\n---\n${'x'.repeat(10000)}` })
    await issue($, 'k')
    expect((await paneStrings($)).some((s) => s.includes('Clipped:'))).toBe(false)
  })

  test('carriage returns and escapes are stripped from title and body', async ($, on) => {
    world(on, { read: `---\ntitle: "a${CR}b"\n---\nline1${CR}\nline2 ${ESC}[31mred${ESC}[0m\n` })
    await issue($, 'k')
    const tree = await $.ui.render(PANE)
    for (const text of stringsIn(tree)) expect(DRAWABLE.test(text)).toBe(true)
    expect(nodesOf(tree, 'Markdown')[0].props.text.includes('line1\nline2 [31mred[0m')).toBe(true)
    const title = nodesOf(tree, 'Text').filter((node: any) => node.props?.bold)
    expect(stringsIn(title[0])).toEqual(['ab'])
  })

  test('an escape in a CLI message is stripped', async ($, on) => {
    world(on, { read: `Error: ${ESC}[31mboom` })
    await issue($, 'k')
    const strings = await paneStrings($)
    expect(strings).toContain('Error: [31mboom')
    expect(strings.some((s) => s.includes(ESC))).toBe(false)
  })
})

describe('other panes', () => {
  test('a pane that is not obw issue draws as it would without obw', async ($, on) => {
    world(on)
    on('ui.render', { component: 'Pane' }, () => ({ type: 'Text', children: ['beneath'] }))
    await $.session.start(SESSION)
    expect(await $.ui.render({ ...PANE, requestId: 'other' })).toEqual({ type: 'Text', children: ['beneath'] })
  })
})
