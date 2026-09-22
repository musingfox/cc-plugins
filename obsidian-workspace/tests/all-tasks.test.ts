import { describe, expect, test } from 'claude-code/testing'
import { PANE, cardSelect, clientNode, expectDrawn, issue, nodesOf, pick, runsOf, stringsIn, viewSelect } from './fixtures/pane.ts'
import { ALL_TASKS_ARGV, CARD, DASHBOARD_ARGV, VIEW_NAMES, VIEW_STRINGS, world } from './fixtures/world.ts'
import { MIX, P } from './fixtures/rows.ts'
import { RED } from '../hooks/style.ts'

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

describe('All Tasks list', () => {
  const pathsIn = (tree: any) => clientNode(tree).props.props.groups.flatMap((group: any) => group.rows.map((row: any) => row.path))

  test('the default list is drawn in the Client', async ($, on) => {
    world(on, { query: JSON.stringify(MIX) })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(clientNode(tree).props.props.groups.map((group: any) => [group.status, group.count])).toEqual([
      ['todo', 4],
      ['in-progress', 1],
      ['blocked', 1],
      ['done', 2],
      ['waiting', 1],
      [null, 1],
    ])
    expect(stringsIn(tree)).toEqual([...VIEW_STRINGS, '1 row of the All Tasks view is not a card under pm/cc-plugins and was left out.'])
  })

  test('/issue All Tasks draws the list', async ($, on) => {
    world(on, { query: JSON.stringify(MIX) })
    await issue($, 'All Tasks')
    expect(pathsIn(await $.ui.render(PANE))).toEqual([P('b'), P('a'), P('i'), P('j'), P('c'), P('d'), P('f'), P('e'), P('g'), P('h')])
  })

  test('picking All Tasks draws the list', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX) })
    await issue($, 'Docs')
    await pick($, w, 'views', 'All Tasks')
    const tree = await $.ui.render(PANE)
    expect(clientNode(tree)).toBeDefined()
    expect(cardSelect(tree)).toBe(undefined)
    expect(viewSelect(tree).props.value).toBe('All Tasks')
  })

  test('the list waits on the same loading screen', async ($, on) => {
    const w = world(on, { query: 'hang' })
    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    const done = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    const loading = await $.ui.render(PANE)
    expect(stringsIn(loading)).toEqual(['Reading the vault…'])
    expect(nodesOf(loading, 'Select')).toHaveLength(0)
    await w.clock.advance(60000)
    await done
    expect(pathsIn(await $.ui.render(PANE))).toEqual([P('a')])
  })

  test('an empty All Tasks view has no list', async ($, on) => {
    world(on, { query: '[]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(cardSelect(tree)).toBe(undefined)
    expect(clientNode(tree)).toBe(undefined)
    expect(stringsIn(tree)).toContain('No cards in the All Tasks view of pm/cc-plugins.')
    const notice = nodesOf(tree, 'Text').find((node: any) => stringsIn(node).includes('No cards in the All Tasks view of pm/cc-plugins.'))
    expect(notice.props.dimColor).toBe(true)
    expect(nodesOf(tree, 'Text').some((node: any) => node.props?.color === RED)).toBe(false)
  })

  test('a listing of only done cards is a list, not an empty view', async ($, on) => {
    world(on, { query: '[{"path":"pm/cc-plugins/tasks/e.md","status":"done"}]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(clientNode(tree).props.props.groups.map((group: any) => [group.status, group.count])).toEqual([['done', 1]])
    expect(stringsIn(tree).some((text: string) => text.includes('No cards'))).toBe(false)
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
    expect(pathsIn(await $.ui.render(PANE))).toEqual([P('b')])
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

describe('done cards', () => {
  test('/issue still opens a done card that the list folds', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX), read: CARD })
    await issue($, 'e')
    const tree = await $.ui.render(PANE)
    expect(runsOf(w, 'read')[0].argv[3]).toBe('path=pm/cc-plugins/tasks/e.md')
    expect(nodesOf(tree, 'Markdown')).toHaveLength(1)
    expect(clientNode(tree)).toBeDefined()
    expectDrawn(tree)
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
  test('the list never enters the command result', async ($, on) => {
    world(on, { query: '[{"path":"pm/cc-plugins/tasks/a.md","status":"zz-marker"}]' })
    const result = await issue($, '')
    expect(result).toEqual({})
    expect(JSON.stringify(clientNode(await $.ui.render(PANE)).props.props)).toContain('zz-marker')
    expect(JSON.stringify(result).includes('zz-marker')).toBe(false)
  })
})

describe('bounded list text', () => {
  test('vault values in the list props stay within draw bounds', async ($, on) => {
    const CR = String.fromCharCode(13)
    world(on, {
      query: JSON.stringify([
        { path: P('a'), status: 'x'.repeat(11000) },
        { path: P('b'), status: `a${CR}b`, priority: `c${CR}d`, title: `t${CR}u` },
      ]),
    })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expectDrawn(tree)
    const props = clientNode(tree).props.props
    const flat = JSON.stringify(props)
    expect(flat.includes(CR)).toBe(false)
    expect(flat.includes('x'.repeat(33))).toBe(false)
    expect(props.groups.map((group: any) => group.status)).toEqual(['x'.repeat(31) + '…', 'ab'])
    expect(props.groups[1].rows[0].title).toBe('tu')
  })
})
