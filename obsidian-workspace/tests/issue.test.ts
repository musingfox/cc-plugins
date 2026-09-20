import { describe, expect, test } from 'claude-code/testing'
import { PANE, cardSelect, headerIn, issue, nodesOf, runsOf, stringsIn, viewSelect } from './fixtures/pane.ts'
import { CARD, QUERY_ARGV, SESSION, VIEW_STRINGS, world } from './fixtures/world.ts'

const VIEWS_ARGV = ['obsidian', 'vault=obsidian', 'base:views', 'path=pm/cc-plugins/dashboard.base']
const MOD = 'mod-obw-issue-pane'
const MOD_PATH = `pm/cc-plugins/tasks/${MOD}.md`
const readArgv = (path: string) => ['obsidian', 'vault=obsidian', 'read', `path=${path}`]
const rows = (...paths: string[]) => JSON.stringify(paths.map((path) => ({ path, status: 'todo' })))

async function paneStrings($: any) {
  return stringsIn(await $.ui.render(PANE))
}

describe('command registration', () => {
  test('session start registers /issue', async ($, on) => {
    const w = world(on)
    expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' })
    expect(w.registered[0]).toEqual({
      name: 'issue',
      description: 'Show an obw dashboard view or card in a pane',
      argumentHint: '[view|card]',
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

  test('a pane that is not obw issue draws as it would without obw', async ($, on) => {
    world(on)
    on('ui.render', { component: 'Pane' }, () => ({ type: 'Text', children: ['beneath'] }))
    await $.session.start(SESSION)
    expect(await $.ui.render({ ...PANE, requestId: 'other' })).toEqual({ type: 'Text', children: ['beneath'] })
  })
})

describe('command result', () => {
  test('a shown list returns an empty result', async ($, on) => {
    const w = world(on)
    expect(await issue($, '')).toEqual({})
    expect(w.runs.length).toBe(2)
  })

  test('a shown card returns an empty result with no card text', async ($, on) => {
    const w = world(on, { query: rows(MOD_PATH) })
    const result = await issue($, MOD)
    expect(result).toEqual({})
    expect(JSON.stringify(result).includes('Acceptance Criteria')).toBe(false)
    expect(w.runs.length).toBe(3)
  })

  test('a query error returns an empty result', async ($, on) => {
    const w = world(on, { query: 'Vault not found.' })
    expect(await issue($, '')).toEqual({})
    expect(runsOf(w, 'read')).toEqual([])
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
      query: '[]',
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
    const w = world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': 'pm:\n  project: p\n' } })
    await issue($, '')
    expect(await paneStrings($)).toContain('/w/.obsidian.yaml has no vault.')
    expect(w.runs).toEqual([])
  })

  test('a config with neither key is named in the pane', async ($, on) => {
    const w = world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': 'note: {}\n' } })
    await issue($, '')
    expect(await paneStrings($)).toContain('/w/.obsidian.yaml has no vault or pm.project.')
    expect(w.runs).toEqual([])
  })

  test('an unreadable config is named in the pane', async ($, on) => {
    const w = world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': { deny: 'x' } } })
    await issue($, '')
    expect(await paneStrings($)).toContain('Could not read /w/.obsidian.yaml.')
    expect(w.runs).toEqual([])
  })

  test('a project that is not one folder under pm/ is refused before any run', async ($, on) => {
    const w = world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': 'vault: v\npm:\n  project: a/b\n' } })
    await issue($, '')
    expect(await paneStrings($)).toContain('pm.project "a/b" cannot name a folder under pm/.')
    expect(w.runs).toEqual([])
  })

  test('a config at the filesystem root is named without a doubled slash', async ($, on) => {
    const w = world(on, { cwd: '/', files: { '/.obsidian.yaml': 'vault: v\n' } })
    await issue($, '')
    expect(await paneStrings($)).toContain('/.obsidian.yaml has no pm.project.')
    expect(w.runs).toEqual([])
  })

  test('a configuration error says nothing about /obw:pm', async ($, on) => {
    world(on, { cwd: '/w', files: {} })
    await issue($, '')
    const missing = await paneStrings($)
    expect(missing).toContain('No .obsidian.yaml in /w or any directory above it.')
    expect(missing.some((s) => s.includes('/obw:pm'))).toBe(false)
    expect(missing.some((s) => s.includes('cc-plugins'))).toBe(false)
  })

  test('a config without pm.project says nothing about /obw:pm', async ($, on) => {
    world(on, { cwd: '/w', files: { '/w/.obsidian.yaml': 'vault: v\n' } })
    await issue($, '')
    const strings = await paneStrings($)
    expect(strings).toContain('/w/.obsidian.yaml has no pm.project.')
    expect(strings.some((s) => s.includes('/obw:pm'))).toBe(false)
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
    const w = world(on, { query: rows('pm/cc-plugins/tasks/ok-card.md') })
    await issue($, '  ok-card ')
    expect(runsOf(w, 'read')[0].argv[3]).toBe('path=pm/cc-plugins/tasks/ok-card.md')
  })
})

describe('list', () => {
  test('the Active view is one dashboard query drawn as a Select', async ($, on) => {
    const w = world(on, { query: '[{"path":"pm/cc-plugins/tasks/a.md","status":"todo"},{"path":"pm/cc-plugins/tasks/b.md","status":"doing"}]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(w.runs.map((run: any) => run.argv)).toEqual([VIEWS_ARGV, QUERY_ARGV])
    for (const run of w.runs) expect(run.init.timeoutMs).toBe(10000)
    expect(cardSelect(tree).props.options).toEqual([
      { value: 'pm/cc-plugins/tasks/a.md', label: 'todo · a' },
      { value: 'pm/cc-plugins/tasks/b.md', label: 'doing · b' },
    ])
    expect(cardSelect(tree).props.value).toBe(undefined)
    expect(w.invalidates >= 1).toBe(true)
  })

  test('the pane re-orders nothing the CLI sent', async ($, on) => {
    const w = world(on, { query: '[{"path":"pm/cc-plugins/tasks/a.md","status":"zeta"},{"path":"pm/cc-plugins/tasks/b.md","status":"alpha"}]' })
    await issue($, '')
    expect(cardSelect(await $.ui.render(PANE)).props.options.map((option: any) => option.label)).toEqual(['zeta · a', 'alpha · b'])
    expect(runsOf(w, 'base:query')).toHaveLength(1)
  })

  test('drawing the pane again runs nothing', async ($, on) => {
    const w = world(on, { query: rows('pm/cc-plugins/tasks/a.md', 'pm/cc-plugins/tasks/b.md') })
    await issue($, '')
    await $.ui.render(PANE)
    await $.ui.render(PANE)
    await $.ui.render(PANE)
    expect(w.runs.length).toBe(2)
  })

  test('an empty view is said in text, with no card Select', async ($, on) => {
    world(on, { query: '[]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree)).toBe(undefined)
    expect(nodesOf(tree, 'Select')).toHaveLength(1)
    expect(stringsIn(tree)).toContain('No cards in the Active view of pm/cc-plugins.')
  })

  test('an empty view names the view it asked for', async ($, on) => {
    world(on, { query: '[]' })
    await issue($, 'Docs')
    expect(await paneStrings($)).toContain('No cards in the Docs view of pm/cc-plugins.')
  })

  test('a view of rows that cannot be opened reads as empty', async ($, on) => {
    world(on, { query: '[{"path":"pm/other/tasks/a.md"}]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree)).toBe(undefined)
    expect(stringsIn(tree)).toContain('No cards in the Active view of pm/cc-plugins.')
  })

  test('an empty view says nothing about /obw:pm', async ($, on) => {
    world(on, { query: '[]' })
    await issue($, '')
    expect((await paneStrings($)).some((s) => s.includes('/obw:pm'))).toBe(false)
  })

  test('a missing dashboard is shown as the CLI printed it, with the pm hint', async ($, on) => {
    const w = world(on, { query: 'Error: Base file not found: pm/cc-plugins/dashboard.base' })
    await issue($, '')
    const strings = await paneStrings($)
    const cli = strings.indexOf('Error: Base file not found: pm/cc-plugins/dashboard.base')
    expect(cli).toBeGreaterThan(-1)
    expect(strings.indexOf('If pm/cc-plugins/dashboard.base is missing, run /obw:pm to create it.')).toBe(cli + 1)
    expect(w.runs.length).toBe(2)
  })

  test('an unknown vault is shown as the CLI printed it', async ($, on) => {
    world(on, { query: 'Vault not found.\n' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree)).toBe(undefined)
    expect(stringsIn(tree)).toContain('Vault not found.')
    expect(stringsIn(tree)).toContain('If pm/cc-plugins/dashboard.base is missing, run /obw:pm to create it.')
  })

  test('output of no known shape is shown as printed', async ($, on) => {
    world(on, { query: 'garbage' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree)).toBe(undefined)
    expect(stringsIn(tree)).toContain('garbage')
    expect(stringsIn(tree)).toContain('If pm/cc-plugins/dashboard.base is missing, run /obw:pm to create it.')
  })

  test('a CLI that did not run is said so', async ($, on) => {
    world(on, { query: { deny: 'spawn failed' } })
    await issue($, '')
    const strings = await paneStrings($)
    expect(strings).toContain('The obsidian CLI did not run: it is not on PATH, or it did not answer within 10 s.')
    expect(strings).toContain('If pm/cc-plugins/dashboard.base is missing, run /obw:pm to create it.')
  })

  test('a healthy list says nothing about /obw:pm', async ($, on) => {
    world(on)
    await issue($, '')
    expect((await paneStrings($)).some((s) => s.includes('/obw:pm'))).toBe(false)
  })

  test('duplicate paths leave one option each', async ($, on) => {
    world(on, {
      query: '[{"path":"pm/cc-plugins/tasks/a.md","status":"todo"},{"path":"pm/cc-plugins/tasks/a.md","status":"todo"}]',
    })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(tree.type).not.toBe('engine')
    expect(cardSelect(tree).props.options).toEqual([{ value: 'pm/cc-plugins/tasks/a.md', label: 'todo · a' }])
  })

  test('an archived row is listed under its own path', async ($, on) => {
    world(on, { query: '[{"path":"pm/cc-plugins/tasks/archive/c.md","status":"done"}]' })
    await issue($, '')
    expect(cardSelect(await $.ui.render(PANE)).props.options).toEqual([
      { value: 'pm/cc-plugins/tasks/archive/c.md', label: 'done · c' },
    ])
  })

  test('a row path is drawn as the dashboard sent it', async ($, on) => {
    world(on, { query: '[{"path":"pm/cc-plugins/docs/mattpocock-skills-import.md"}]' })
    await issue($, 'Docs')
    expect(cardSelect(await $.ui.render(PANE)).props.options[0].value).toBe('pm/cc-plugins/docs/mattpocock-skills-import.md')
  })

  test('a row path that could name another note is left out', async ($, on) => {
    world(on, { query: '[{"path":"pm/cc-plugins/tasks/a\\u0001b.md"},{"path":"pm/cc-plugins/tasks/ab.md"}]' })
    await issue($, '')
    expect(cardSelect(await $.ui.render(PANE)).props.options).toEqual([
      { value: 'pm/cc-plugins/tasks/ab.md', label: 'ab' },
    ])
  })

  test('the pane reads "Reading the vault…" while the query runs', async ($, on) => {
    const w = world(on, { query: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    const loading = await $.ui.render(PANE)
    expect(w.runs.length).toBe(2)
    expect(stringsIn(loading)).toEqual(['Reading the vault…'])
    expect(nodesOf(loading, 'Select')).toHaveLength(0)
    expect(cardSelect(loading)).toBe(undefined)
    expect(nodesOf(loading, 'Markdown')).toHaveLength(0)
    await w.clock.advance(60000)
    await done
    expect(cardSelect(await $.ui.render(PANE))).toBeDefined()
  })
})

describe('the view switcher', () => {
  test('the dashboard view names are the switcher options', async ($, on) => {
    world(on)
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select')).toHaveLength(2)
    expect(viewSelect(tree).props.options).toEqual(
      ['Active', 'Blocked', 'By Parent', 'Recently Completed', 'By Tag', 'Docs'].map((name) => ({ value: name, label: name })),
    )
    expect(viewSelect(tree).props.value).toBe('Active')
  })

  test('an argument view is queried and shown as chosen', async ($, on) => {
    const w = world(on)
    await issue($, 'Docs')
    expect(runsOf(w, 'base:query')[0].argv).toEqual([
      'obsidian',
      'vault=obsidian',
      'base:query',
      'path=pm/cc-plugins/dashboard.base',
      'view=Docs',
      'format=json',
    ])
    expect(viewSelect(await $.ui.render(PANE)).props.value).toBe('Docs')
  })

  test('a view name with a space is queried whole', async ($, on) => {
    const w = world(on, { query: '[{"path":"pm/cc-plugins/tasks/a.md"}]' })
    await issue($, 'Recently Completed')
    expect(runsOf(w, 'base:query')[0].argv).toContain('view=Recently Completed')
    expect(cardSelect(await $.ui.render(PANE)).props.options).toEqual([{ value: 'pm/cc-plugins/tasks/a.md', label: 'a' }])
  })

  test('a view argument preselects no card', async ($, on) => {
    const w = world(on)
    await issue($, 'Docs')
    expect(w.runs.length).toBe(2)
    expect(cardSelect(await $.ui.render(PANE)).props.value).toBe(undefined)
  })

  test('an empty view still draws the switcher', async ($, on) => {
    world(on, { query: '[]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(viewSelect(tree)).toBeDefined()
    expect(cardSelect(tree)).toBe(undefined)
  })

  test('a view listing that could not be drawn is not offered', async ($, on) => {
    world(on, { views: `${'v'.repeat(11000)}\ttable\nDocs\ttable\n` })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(tree.type).not.toBe('engine')
    expect(viewSelect(tree).props.options).toEqual([{ value: 'Docs', label: 'Docs' }])
    for (const text of stringsIn(tree)) expect(text.length).toBeLessThanOrEqual(10000)
  })

  test('a failed view listing leaves the card picker alone', async ($, on) => {
    world(on, { views: { deny: 'spawn failed' } })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Select')).toHaveLength(1)
    expect(cardSelect(tree).props.key).toBe('cards')
    expect(stringsIn(tree).some((text: string) => text.includes('did not run'))).toBe(false)
  })

  test('an argument is a card when no view could be listed', async ($, on) => {
    const w = world(on, { views: { deny: 'no' } })
    await issue($, 'Active')
    expect(runsOf(w, 'read')[0].argv).toEqual(readArgv('pm/cc-plugins/tasks/Active.md'))
  })

  test('switching views empties the list and the card before the new rows arrive', async ($, on) => {
    const w = world(on, { query: 'defer', read: CARD })
    await $.session.start(SESSION)
    const first = $.command.run({ command: 'issue', args: MOD })
    await w.clock.settle()
    w.release(1, rows(MOD_PATH))
    await first
    await w.clock.settle()
    expect(nodesOf(await $.ui.render(PANE), 'Markdown')).toHaveLength(1)
    const second = $.command.run({ command: 'issue', args: 'Docs' })
    await w.clock.settle()
    const loading = await $.ui.render(PANE)
    expect(stringsIn(loading)).toEqual(['Reading the vault…'])
    expect(nodesOf(loading, 'Select')).toHaveLength(0)
    expect(cardSelect(loading)).toBe(undefined)
    expect(nodesOf(loading, 'Markdown')).toHaveLength(0)
    expect(stringsIn(loading)).toContain('Reading the vault…')
    expect(stringsIn(loading)).not.toContain('Claude Mod：面板顯示 obw 的 task 與 issue')
    w.release(4, '[{"path":"pm/cc-plugins/docs/d.md"}]')
    await second
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(viewSelect(tree).props.value).toBe('Docs')
    expect(cardSelect(tree).props.options).toEqual([{ value: 'pm/cc-plugins/docs/d.md', label: 'd' }])
    expect(cardSelect(tree).props.value).toBe(undefined)
    expect(nodesOf(tree, 'Markdown')).toHaveLength(0)
  })
})

describe('card', () => {
  test('/issue <card> draws the header and body below the preselected list', async ($, on) => {
    const w = world(on, { query: rows(MOD_PATH, 'pm/cc-plugins/tasks/other.md'), read: CARD })
    await issue($, MOD)
    const tree = await $.ui.render(PANE)
    expect(w.runs.map((run: any) => run.argv)).toEqual([VIEWS_ARGV, QUERY_ARGV, readArgv(MOD_PATH)])
    expect(cardSelect(tree).props.value).toBe(MOD_PATH)
    const strings = stringsIn(tree)
    expect(strings).toContain('Claude Mod：面板顯示 obw 的 task 與 issue')
    expect(stringsIn(headerIn(tree)).join('')).toBe('status: todo · priority: medium · AC 0/1')
    const markdowns = nodesOf(tree, 'Markdown')
    expect(markdowns.length).toBe(1)
    expect(markdowns[0].props.text).toBe('# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n')
    const flat = JSON.stringify(tree)
    expect(flat.indexOf('"type":"Select"') < flat.indexOf('"type":"Markdown"')).toBe(true)
  })

  test('a card read with no status in its frontmatter reads two dashes', async ($, on) => {
    const w = world(on, { query: '[{"path":"pm/cc-plugins/docs/d.md"}]', read: '---\ntitle: d\n---\nbody\n' })
    await issue($, 'd')
    expect(runsOf(w, 'read')[0].argv).toEqual(readArgv('pm/cc-plugins/tasks/d.md'))
    expect(stringsIn(headerIn(await $.ui.render(PANE))).join('')).toBe('status: — · priority: —')
  })

  test('a missing card is a message under the list, with no body', async ($, on) => {
    world(on, { read: 'Error: File "pm/cc-plugins/tasks/nope.md" not found.\n' })
    await issue($, 'nope')
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree)).toBeDefined()
    expect(stringsIn(tree)).toContain('Error: File "pm/cc-plugins/tasks/nope.md" not found.')
    expect(nodesOf(tree, 'Markdown').length).toBe(0)
  })

  test('a card outside the list is still preselected without breaking the pane', async ($, on) => {
    world(on, {
      query: rows('pm/cc-plugins/tasks/a.md', 'pm/cc-plugins/tasks/b.md'),
      read: 'Error: File "pm/cc-plugins/tasks/zzz.md" not found.\n',
    })
    await issue($, 'zzz')
    const tree = await $.ui.render(PANE)
    expect(tree.type).not.toBe('engine')
    expect(cardSelect(tree).props.value).toBe('pm/cc-plugins/tasks/zzz.md')
  })

  test('an unknown vault on read is a message, with no body', async ($, on) => {
    world(on, { read: 'Vault not found.' })
    await issue($, 'k')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Markdown').length).toBe(0)
    expect(stringsIn(tree)).toContain('Vault not found.')
  })

  test('a closed app on the query is the only message, and nothing is read', async ($, on) => {
    const closed = 'The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again.'
    const w = world(on, { query: { exitCode: 1, stdout: '', stderr: `${closed}\n` } })
    await issue($, 'k')
    const tree = await $.ui.render(PANE)
    expect(runsOf(w, 'read')).toEqual([])
    expect(stringsIn(tree)).toContain(closed)
    expect(cardSelect(tree)).toBe(undefined)
    expect(nodesOf(tree, 'Markdown').length).toBe(0)
  })

  test('a card missing from the view still draws below the empty notice', async ($, on) => {
    world(on, { query: '[]', read: CARD })
    await issue($, 'done-card')
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).toContain('No cards in the Active view of pm/cc-plugins.')
    expect(nodesOf(tree, 'Markdown').length).toBe(1)
  })

  test('a card without title, or priority, falls back to its path and a dash', async ($, on) => {
    world(on, { read: '---\nstatus: todo\n---\nbody\n' })
    await issue($, 'k')
    const tree = await $.ui.render(PANE)
    const title = nodesOf(tree, 'Text').filter((node: any) => node.props?.bold)
    expect(stringsIn(title[0])).toEqual(['pm/cc-plugins/tasks/k.md'])
    expect(stringsIn(headerIn(tree)).join('')).toBe('status: todo · priority: —')
  })

  test('a name that cannot become a card path is refused in the card region', async ($, on) => {
    const w = world(on)
    await issue($, 'x'.repeat(11000))
    const tree = await $.ui.render(PANE)
    expect(tree.type).not.toBe('engine')
    expect(runsOf(w, 'read')).toEqual([])
    expect(w.runs.length).toBe(2)
    const strings = stringsIn(tree)
    expect(strings.some((text: string) => text.startsWith('"pm/cc-plugins/tasks/xxxxxxxxxx'))).toBe(true)
    for (const text of strings) expect(text.length).toBeLessThanOrEqual(10000)
  })

  test('the card region reads "Reading <card>…" while the read runs', async ($, on) => {
    const w = world(on, { query: rows(MOD_PATH), read: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: MOD })
    await w.clock.settle()
    const loading = await $.ui.render(PANE)
    expect(w.runs.length).toBe(3)
    expect(cardSelect(loading)).toBeDefined()
    expect(stringsIn(loading)).toContain(`Reading ${MOD_PATH}…`)
    await w.clock.advance(60000)
    await done
  })
})

describe('overlapping requests', () => {
  const cardTitled = (title: string) => `---\ntitle: ${title}\n---\nbody of ${title}\n`

  test('a card read that settles after a newer card read leaves the newer card drawn', async ($, on) => {
    const w = world(on, { query: rows('pm/cc-plugins/tasks/a.md', 'pm/cc-plugins/tasks/b.md'), read: 'defer' })
    await $.session.start(SESSION)
    const first = $.command.run({ command: 'issue', args: 'a' })
    await w.clock.settle()
    const second = $.command.run({ command: 'issue', args: 'b' })
    await w.clock.settle()
    expect(runsOf(w, 'read').map((run: any) => run.argv[3])).toEqual([
      'path=pm/cc-plugins/tasks/a.md',
      'path=pm/cc-plugins/tasks/b.md',
    ])
    w.release(5, cardTitled('Card B'))
    await w.clock.settle()
    w.release(2, cardTitled('Card A'))
    await Promise.all([first, second])
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree).props.value).toBe('pm/cc-plugins/tasks/b.md')
    const strings = stringsIn(tree)
    expect(strings).toContain('Card B')
    expect(strings).not.toContain('Card A')
    expect(nodesOf(tree, 'Markdown')[0].props.text).toBe('body of Card B\n')
  })

  test('a query that settles after a newer /issue leaves the newer list drawn and reads nothing', async ($, on) => {
    const w = world(on, { query: 'defer' })
    await $.session.start(SESSION)
    const first = $.command.run({ command: 'issue', args: 'a' })
    await w.clock.settle()
    const second = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    expect(w.runs.length).toBe(4)
    w.release(3, rows('pm/cc-plugins/tasks/b.md'))
    await second
    w.release(1, rows('pm/cc-plugins/tasks/a.md'))
    await first
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree).props.options).toEqual([{ value: 'pm/cc-plugins/tasks/b.md', label: 'todo · b' }])
    expect(cardSelect(tree).props.value).toBe(undefined)
    expect(stringsIn(tree)).toEqual([...VIEW_STRINGS, 'pm/cc-plugins/tasks/b.md', 'todo · b'])
    expect(runsOf(w, 'read')).toEqual([])
  })

  test('a card read started by an earlier /issue does not land in a newer one', async ($, on) => {
    const w = world(on, { query: 'defer', read: 'defer' })
    await $.session.start(SESSION)
    const first = $.command.run({ command: 'issue', args: 'a' })
    await w.clock.settle()
    w.release(1, rows('pm/cc-plugins/tasks/a.md'))
    await w.clock.settle()
    expect(runsOf(w, 'read')[0].argv[3]).toBe('path=pm/cc-plugins/tasks/a.md')
    const second = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    w.release(4, rows('pm/cc-plugins/tasks/b.md'))
    await second
    w.release(2, cardTitled('Card A'))
    await first
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree).props.options).toEqual([{ value: 'pm/cc-plugins/tasks/b.md', label: 'todo · b' }])
    expect(cardSelect(tree).props.value).toBe(undefined)
    expect(stringsIn(tree)).toEqual([...VIEW_STRINGS, 'pm/cc-plugins/tasks/b.md', 'todo · b'])
    expect(nodesOf(tree, 'Markdown').length).toBe(0)
  })
})

describe('column labels are never keys', () => {
  // A zh-TW Obsidian returns `檔案基本名稱` for file.name, and a vault owner can rename
  // any formula's displayName, so the same rows arrive under headers the module never saw.
  const TEMPLATE_LABELS = '[{"path":"pm/cc-plugins/tasks/a.md","Title":"A","status":"todo","priority":"high","due":null,"Days Until Due":"","tags":["x"]}]'
  const RENAMED_LABELS = '[{"path":"pm/cc-plugins/tasks/a.md","檔案基本名稱":"A","status":"todo","優先度":"high","到期日":null,"距到期天數":"","標籤":["x"]}]'
  const OPTIONS = [{ value: 'pm/cc-plugins/tasks/a.md', label: 'todo · a' }]

  test('renaming every column header changes nothing the pane draws', async ($, on) => {
    const w = world(on, { query: 'defer' })
    await $.session.start(SESSION)

    const template = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    w.release(1, TEMPLATE_LABELS)
    await template
    const withTemplateLabels = await $.ui.render(PANE)

    const renamed = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    w.release(3, RENAMED_LABELS)
    await renamed
    const withRenamedLabels = await $.ui.render(PANE)

    expect(stringsIn(withRenamedLabels)).toEqual(stringsIn(withTemplateLabels))
    expect(cardSelect(withTemplateLabels).props.options).toEqual(OPTIONS)
    expect(cardSelect(withRenamedLabels).props.options).toEqual(OPTIONS)
  })

  test('a display formula never becomes a card label', async ($, on) => {
    const w = world(on, { query: RENAMED_LABELS })
    await issue($, '')
    const strings = await paneStrings($)
    expect(strings).not.toContain('A')
    expect(cardSelect(await $.ui.render(PANE)).props.options).toEqual(OPTIONS)
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
