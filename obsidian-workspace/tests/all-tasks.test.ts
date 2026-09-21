import { describe, expect, test } from 'claude-code/testing'
import { PANE, cardSelect, expectDrawn, headerIn, issue, nodesOf, pick, runsOf, stringsIn, viewSelect } from './fixtures/pane.ts'
import { ALL_TASKS_ARGV, CARD, DASHBOARD_ARGV, VIEW_NAMES, VIEW_STRINGS, world } from './fixtures/world.ts'
import { GROUPED_MIX, MIX } from './grouped.test.ts'
import { RED } from '../hooks/style.ts'

const P = (name: string) => `pm/cc-plugins/tasks/${name}.md`
const readArgv = (path: string) => ['obsidian', 'vault=obsidian', 'read', `path=${path}`]

describe('default view', () => {
  test('/issue opens All Tasks with one query', async ($, on) => {
    const w = world(on)
    await issue($, '')
    expect(w.runs.map((run: any) => run.argv)).toEqual([DASHBOARD_ARGV, ALL_TASKS_ARGV])
    for (const run of w.runs) expect(run.init.timeoutMs).toBe(10000)
    const tree = await $.ui.render(PANE)
    expect(viewSelect(tree).props.value).toBe('All Tasks')
    expect(viewSelect(tree).props.options).toEqual(VIEW_NAMES.map((name) => ({ value: name, label: name })))
  })

  test('a failed listing falls back to Active', async ($, on) => {
    const w = world(on, { views: { deny: 'no' } })
    await issue($, '')
    expect(runsOf(w, 'base:query')[0].argv).toContain('view=Active')
  })

  test('/issue <card> queries All Tasks then reads the card', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX) })
    await issue($, 'a')
    expect(w.runs.map((run: any) => run.argv)).toEqual([DASHBOARD_ARGV, ALL_TASKS_ARGV, readArgv(P('a'))])
  })
})

describe('grouped All Tasks', () => {
  test('the default list is grouped', async ($, on) => {
    world(on, { query: JSON.stringify(MIX) })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree).props.options).toEqual(GROUPED_MIX)
    expect(stringsIn(tree)).toEqual([
      ...VIEW_STRINGS,
      ...GROUPED_MIX.flatMap((option) => [option.value, option.label]),
      '1 row of the All Tasks view is not a card under pm/cc-plugins and was left out.',
    ])
  })

  test('/issue All Tasks is grouped', async ($, on) => {
    world(on, { query: JSON.stringify(MIX) })
    await issue($, 'All Tasks')
    expect(cardSelect(await $.ui.render(PANE)).props.options).toEqual(GROUPED_MIX)
  })

  test('picking All Tasks groups the list', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX) })
    await issue($, 'Docs')
    await pick($, w, 'views', 'All Tasks')
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree).props.options).toEqual(GROUPED_MIX)
    expect(viewSelect(tree).props.value).toBe('All Tasks')
  })

  test('the grouped list waits on the same loading screen', async ($, on) => {
    const w = world(on, { query: 'hang' })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const done = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    const loading = await $.ui.render(PANE)
    expect(stringsIn(loading)).toEqual(['Reading the vault…'])
    expect(nodesOf(loading, 'Select')).toHaveLength(0)
    await w.clock.advance(60000)
    await done
    expect(cardSelect(await $.ui.render(PANE)).props.options).toEqual([
      { value: '#0', label: 'todo (1)' },
      { value: '#p0.0', label: '  —' },
      { value: P('a'), label: '    a' },
    ])
  })

  test('an empty All Tasks view has no cards Select', async ($, on) => {
    world(on, { query: '[]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree)).toBe(undefined)
    expect(stringsIn(tree)).toContain('No cards in the All Tasks view of pm/cc-plugins.')
    const notice = nodesOf(tree, 'Text').find((node: any) => stringsIn(node).includes('No cards in the All Tasks view of pm/cc-plugins.'))
    expect(notice.props.dimColor).toBe(true)
    expect(nodesOf(tree, 'Text').some((node: any) => node.props?.color === RED)).toBe(false)
  })

  test('a listing of only done cards is the heading', async ($, on) => {
    world(on, { query: '[{"path":"pm/cc-plugins/tasks/e.md","status":"done"}]' })
    await issue($, '')
    expect(cardSelect(await $.ui.render(PANE)).props.options).toEqual([{ value: '#0', label: 'done (1)' }])
    expect(stringsIn(await $.ui.render(PANE)).some((text: string) => text.includes('No cards'))).toBe(false)
  })

  test('a stale All Tasks query never replaces the newer list', async ($, on) => {
    const w = world(on, { query: 'defer' })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const first = $.command.run({ command: 'issue', args: 'a' })
    await w.clock.settle()
    const second = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    w.release(3, '[{"path":"pm/cc-plugins/tasks/b.md","status":"todo"}]')
    await second
    w.release(1, '[{"path":"pm/cc-plugins/tasks/a.md","status":"todo"}]')
    await first
    await w.clock.settle()
    expect(cardSelect(await $.ui.render(PANE)).props.options).toEqual([
      { value: '#0', label: 'todo (1)' },
      { value: '#p0.0', label: '  —' },
      { value: P('b'), label: '    b' },
    ])
  })
})

describe('other views', () => {
  test('picking Active draws the flat list', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX) })
    await issue($, '')
    await pick($, w, 'views', 'Active')
    expect(cardSelect(await $.ui.render(PANE)).props.options).toEqual([
      { value: P('g'), label: 'waiting · g' },
      { value: P('a'), label: 'todo · a' },
      { value: P('b'), label: 'todo · b' },
      { value: P('i'), label: 'todo · i' },
      { value: P('j'), label: 'todo · j' },
      { value: P('c'), label: 'in-progress · c' },
      { value: P('d'), label: 'blocked · d' },
      { value: P('e'), label: 'done · e' },
      { value: P('f'), label: 'done · f' },
      { value: P('h'), label: 'h' },
    ])
  })

  test('/issue Active has no heading options', async ($, on) => {
    world(on, { query: JSON.stringify(MIX) })
    await issue($, 'Active')
    expect(cardSelect(await $.ui.render(PANE)).props.options.some((option: any) => option.value.startsWith('#'))).toBe(false)
  })
})

describe('opening a grouped card', () => {
  test('picking a grouped card reads it under the list', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX), read: CARD })
    await issue($, '')
    await pick($, w, 'cards', P('b'))
    const tree = await $.ui.render(PANE)
    expect(runsOf(w, 'read')[0].argv[3]).toBe('path=pm/cc-plugins/tasks/b.md')
    expect(cardSelect(tree).props.value).toBe(P('b'))
    expect(nodesOf(tree, 'Markdown')).toHaveLength(1)
    expect(stringsIn(headerIn(tree)).join('')).toBe('status: todo · priority: medium · AC 0/1')
    expect(cardSelect(tree).props.options).toEqual(GROUPED_MIX)
  })
})

describe('done cards', () => {
  test('/issue still opens a done card that the list hides', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX), read: CARD })
    await issue($, 'e')
    const tree = await $.ui.render(PANE)
    expect(runsOf(w, 'read')[0].argv[3]).toBe('path=pm/cc-plugins/tasks/e.md')
    expect(nodesOf(tree, 'Markdown')).toHaveLength(1)
    expect(cardSelect(tree).props.options.map((option: any) => option.value)).not.toContain(P('e'))
    expectDrawn(tree)
  })
})

describe('heading picks', () => {
  test('picking a status heading changes nothing', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX) })
    await issue($, '')
    const before = stringsIn(await $.ui.render(PANE))
    await pick($, w, 'cards', '#0')
    expect(w.runs.length).toBe(2)
    expect(stringsIn(await $.ui.render(PANE))).toEqual(before)
    expect(nodesOf(await $.ui.render(PANE), 'Box').some((node: any) => node.props?.marginTop === 1)).toBe(false)
  })

  test('picking a priority sub-heading changes nothing', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX) })
    await issue($, '')
    const before = stringsIn(await $.ui.render(PANE))
    await pick($, w, 'cards', '#p0.0')
    expect(w.runs.length).toBe(2)
    expect(stringsIn(await $.ui.render(PANE))).toEqual(before)
    expect(nodesOf(await $.ui.render(PANE), 'Box').some((node: any) => node.props?.marginTop === 1)).toBe(false)
  })
})

const HINT =
  'pm/cc-plugins/dashboard.base has no All Tasks view. Run /obw:pm refresh dashboard to regenerate it from the plugin template; hand edits to that file are overwritten.'

describe('missing All Tasks', () => {
  test('a listing without All Tasks opens Active with the refresh hint', async ($, on) => {
    const w = world(on, {
      views: 'views:\n  - type: table\n    name: "Active"\n  - type: table\n    name: "Docs"\n',
      query: '[{"path":"pm/cc-plugins/tasks/a.md","status":"todo"}]',
    })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).toEqual([HINT, 'Active', 'Active', 'Docs', 'Docs', P('a'), 'todo · a'])
    const hint = nodesOf(tree, 'Text').find((node: any) => stringsIn(node).includes(HINT))
    expect(hint.props.dimColor).toBe(true)
    expect('color' in (hint.props ?? {})).toBe(false)
    expect(runsOf(w, 'base:query')[0].argv).toContain('view=Active')
  })

  test('a listing of only Backlog falls back to it', async ($, on) => {
    world(on, { views: 'views:\n  - type: table\n    name: "Backlog"\n', query: '[]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)[0]).toBe(HINT)
    expect(viewSelect(tree).props.value).toBe('Backlog')
  })

  test('a failed listing draws no refresh hint', async ($, on) => {
    world(on, { views: { deny: 'spawn failed' } })
    await issue($, '')
    expect(stringsIn(await $.ui.render(PANE))).not.toContain(HINT)
  })

  test('a dashboard with no views still hints', async ($, on) => {
    world(on, { views: 'views:\n' })
    await issue($, '')
    expect(stringsIn(await $.ui.render(PANE))[0]).toBe(HINT)
  })
})

const PM_HINT = 'If pm/cc-plugins/dashboard.base is missing, run /obw:pm to create it.'

describe('view not found', () => {
  test('a listed All Tasks that Obsidian cannot find gets the refresh hint', async ($, on) => {
    world(on, { query: 'Error: View not found: All Tasks\nAvailable views: Active\n' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    const strings = stringsIn(tree)
    const error = 'Error: View not found: All Tasks\nAvailable views: Active'
    expect(strings).toContain(error)
    expect(strings[strings.indexOf(error) + 1]).toBe(HINT)
    const errorText = nodesOf(tree, 'Text').find((node: any) => stringsIn(node).includes(error))
    expect(errorText.props.color).toBe(RED)
    const hint = nodesOf(tree, 'Text').find((node: any) => stringsIn(node).includes(HINT))
    expect(hint.props.dimColor).toBe(true)
    expect(strings).not.toContain(PM_HINT)
    expect(viewSelect(tree)).toBeDefined()
  })

  test('a different missing view keeps the pm hint', async ($, on) => {
    world(on, { query: 'Error: View not found: All Tasks Extra' })
    await issue($, '')
    const strings = stringsIn(await $.ui.render(PANE))
    expect(strings).toContain(PM_HINT)
    expect(strings).not.toContain(HINT)
  })
})

describe('query errors', () => {
  test('a failed All Tasks query keeps the view picker', async ($, on) => {
    world(on, { query: { deny: 'spawn failed' } })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    const message = 'The obsidian CLI did not run: it is not on PATH, or it did not answer within 10 s.'
    const error = nodesOf(tree, 'Text').find((node: any) => stringsIn(node).includes(message))
    expect(error.props.color).toBe(RED)
    expect(viewSelect(tree).props.value).toBe('All Tasks')
    expect(cardSelect(tree)).toBe(undefined)
    expectDrawn(tree)
  })

  test('the picker still queries another view after a failed All Tasks query', async ($, on) => {
    const w = world(on, { query: { deny: 'spawn failed' } })
    await issue($, '')
    await pick($, w, 'views', 'Docs')
    expect(runsOf(w, 'base:query')[1].argv).toContain('view=Docs')
  })
})

describe('command result', () => {
  test('the grouped list never enters the command result', async ($, on) => {
    world(on, { query: '[{"path":"pm/cc-plugins/tasks/a.md","status":"zz-marker"}]' })
    const result = await issue($, '')
    expect(result).toEqual({})
    expect(stringsIn(await $.ui.render(PANE))).toContain('zz-marker (1)')
    expect(JSON.stringify(result).includes('zz-marker')).toBe(false)
    expect(JSON.stringify(result).includes('(1)')).toBe(false)
  })
})
