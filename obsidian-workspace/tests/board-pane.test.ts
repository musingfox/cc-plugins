import { describe, expect, test } from 'claude-code/testing'
import { PANE, cardSelect, clientNode, expectDrawn, headerIn, issue, mounted, nodesOf, runsOf, stringsIn, uvxRuns, viewSelect, vizWorld } from './fixtures/pane.ts'
import { CARD, MERMAID_CARD, SESSION, world } from './fixtures/world.ts'
import { MIX, P } from './fixtures/rows.ts'
import { RED } from '../hooks/style.ts'

const OUTSIDE = '1 row of the All Tasks view is not a card under pm/cc-plugins and was left out.'

describe('All Tasks list', () => {
  test('/issue draws All Tasks as one Client under the view picker', async ($, on) => {
    world(on)
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Client')).toHaveLength(1)
    const client = clientNode(tree)
    expect(client.props.height).toBe(29)
    expect(client.props.width).toBe(80)
    expect(client.props.props.rows).toBe(29)
    expect(client.props.props.columns).toBe(80)
    expect(client.props.props.card).toBe(null)
    expect(viewSelect(tree).props.value).toBe('All Tasks')
    expect(cardSelect(tree)).toBe(undefined)
    expect(nodesOf(tree, 'Select')).toHaveLength(1)
  })

  test('rows left out shorten the list by the notice under it', async ($, on) => {
    world(on, { query: JSON.stringify(MIX) })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    const client = clientNode(tree)
    expect(client.props.height).toBe(28)
    expect(client.props.props.groups[0].status).toBe('todo')
    expect(client.props.props.groups[0].count).toBe(4)
    expect(client.props.props.groups[0].rows.map((row: any) => row.path)).toEqual([P('b'), P('a'), P('i'), P('j')])
    expect(stringsIn(tree)).toContain(OUTSIDE)
  })

  test('the list takes its size from the pane body', async ($, on) => {
    world(on, { query: JSON.stringify(MIX) })
    await issue($, '')
    const m = await mounted($, { props: { ...PANE.props, bodyColumns: 50, scroll: { offset: 0, bodyRows: 12 } } })
    const client = clientNode(await m.drawn())
    expect(client.props.height).toBe(9)
    expect(client.props.width).toBe(50)
  })

  test('the mounted list draws its status headings', async ($, on) => {
    const w = world(on)
    await issue($, '')
    const m = await mounted($)
    await w.clock.settle()
    const texts = await m.findAll({ type: 'Text', in: 'board' })
    expect(texts.some((text: any) => /^▾ todo  1$/.test(text.text))).toBe(true)
  })

  test('no list is drawn while the query runs', async ($, on) => {
    const w = world(on, { query: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    const loading = await $.ui.render(PANE)
    expect(nodesOf(loading, 'Client')).toHaveLength(0)
    expect(stringsIn(loading)).toEqual(['Reading the vault…'])
    await w.clock.advance(60000)
    await done
  })

  test('/issue Active keeps the flat card list', async ($, on) => {
    world(on, { query: JSON.stringify(MIX) })
    await issue($, 'Active')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Client')).toHaveLength(0)
    expect(cardSelect(tree).props.options.some((option: any) => option.value.startsWith('#'))).toBe(false)
    expect(cardSelect(tree).props.options[0]).toEqual({ value: P('g'), label: 'waiting · g' })
  })
})

describe('surfaces without Client', () => {
  const FLAT = [{ value: 'pm/cc-plugins/tasks/a.md', label: 'todo · a' }]

  test('vscode draws All Tasks as the flat card list', async ($, on) => {
    world(on)
    await issue($, '')
    const tree = await $.ui.render({ ...PANE, surface: 'vscode' })
    expect(cardSelect(tree).props.options).toEqual(FLAT)
    expect(nodesOf(tree, 'Client')).toHaveLength(0)
  })

  // mobile has no Select either, so its All Tasks can only match what a flat view draws there.
  test('mobile draws All Tasks as it draws a flat view', async ($, on) => {
    world(on)
    await issue($, '')
    const tree = await $.ui.render({ ...PANE, surface: 'mobile' })
    expectDrawn(tree)
    expect(nodesOf(tree, 'Client')).toHaveLength(0)
    await issue($, 'Active')
    expect(await $.ui.render({ ...PANE, surface: 'mobile' })).toEqual(tree)
  })

  test('terminal and desktop draw the Client', async ($, on) => {
    world(on)
    await issue($, '')
    const terminal = await $.ui.render({ ...PANE, surface: 'terminal' })
    expect(nodesOf(terminal, 'Client')).toHaveLength(1)
    expect(cardSelect(terminal)).toBe(undefined)
    expect(nodesOf(await $.ui.render({ ...PANE, surface: 'desktop' }), 'Client')).toHaveLength(1)
  })
})

describe('All Tasks without a list', () => {
  const HINT =
    'pm/cc-plugins/dashboard.base has no All Tasks view. Run /obw:pm refresh dashboard to regenerate it from the plugin template; hand edits to that file are overwritten.'

  test('a failed query draws its error with the picker and no list', async ($, on) => {
    world(on, { query: { deny: 'spawn failed' } })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Client')).toHaveLength(0)
    const message = 'The obsidian CLI did not run: it is not on PATH, or it did not answer within 10 s.'
    expect(nodesOf(tree, 'Text').find((node: any) => stringsIn(node).includes(message)).props.color).toBe(RED)
    expect(viewSelect(tree).props.value).toBe('All Tasks')
  })

  test('a view Obsidian cannot find draws the refresh hint after the error and no list', async ($, on) => {
    world(on, { query: 'Error: View not found: All Tasks\nAvailable views: Active\n' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Client')).toHaveLength(0)
    const strings = stringsIn(tree)
    expect(strings[strings.indexOf('Error: View not found: All Tasks\nAvailable views: Active') + 1]).toBe(HINT)
  })

  test('a dashboard without All Tasks opens Active flat, hint first, no list', async ($, on) => {
    world(on, {
      views: 'views:\n  - type: table\n    name: "Active"\n  - type: table\n    name: "Docs"\n',
      query: '[{"path":"pm/cc-plugins/tasks/a.md","status":"todo"}]',
    })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Client')).toHaveLength(0)
    expect(stringsIn(tree)[0]).toBe(HINT)
    expect(cardSelect(tree).props.options).toEqual([{ value: P('a'), label: 'todo · a' }])
  })

  test('an empty All Tasks view draws its notice and no list', async ($, on) => {
    world(on, { query: '[]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Client')).toHaveLength(0)
    expect(stringsIn(tree)).toContain('No cards in the All Tasks view of pm/cc-plugins.')
  })
})

describe('the /issue result', () => {
  test('list text reaches the Client props and never the result', async ($, on) => {
    world(on, { query: JSON.stringify([{ path: P('a'), status: 'zz-marker', title: 'tt-marker' }]) })
    const result = await issue($, '')
    expect(result).toEqual({})
    const props = JSON.stringify(clientNode(await $.ui.render(PANE)).props.props)
    expect(props).toContain('zz-marker')
    expect(props).toContain('tt-marker')
    expect(JSON.stringify(result).includes('zz-marker')).toBe(false)
    expect(JSON.stringify(result).includes('tt-marker')).toBe(false)
  })

  test('card text never reaches the result', async ($, on) => {
    world(on, { read: CARD })
    const result = await issue($, 'a')
    expect(result).toEqual({})
    expect(stringsIn(await $.ui.render(PANE))).toContain('Claude Mod：面板顯示 obw 的 task 與 issue')
    expect(JSON.stringify(result).includes('面板顯示')).toBe(false)
  })
})

describe('a card opened from the list', () => {
  const TITLE = 'Claude Mod：面板顯示 obw 的 task 與 issue'

  // The world answers ui.invalidate itself, so a mounted drawing redraws only when asked.
  async function openFirstRow($: any, w: any) {
    await issue($, '')
    const m = await mounted($)
    await m.key({ key: 'down', in: 'board' })
    await m.key({ key: 'return', in: 'board' })
    await w.clock.settle()
    await m.redraw()
    return m
  }

  test('is drawn inside the Client in place of the list', async ($, on) => {
    const w = world(on)
    const m = await openFirstRow($, w)
    expect(runsOf(w, 'read').map((run: any) => run.argv[3])).toEqual(['path=pm/cc-plugins/tasks/a.md'])
    expect(await m.find({ type: 'Text', text: TITLE, in: 'board' })).toBeDefined()
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Markdown')).toHaveLength(0)
    expect(clientNode(tree).props.props.groups).toEqual([])
  })

  test('runs no termaid', async ($, on) => {
    const w = world(on, { read: MERMAID_CARD })
    await openFirstRow($, w)
    expect(runsOf(w, 'read')).toHaveLength(1)
    expect(uvxRuns(w)).toHaveLength(0)
  })

  test('a failed read is drawn inside the Client', async ($, on) => {
    const w = world(on, { read: 'Error: File "pm/cc-plugins/tasks/a.md" not found.' })
    const m = await openFirstRow($, w)
    expect(await m.find({ type: 'Text', text: 'Error: File "pm/cc-plugins/tasks/a.md" not found.', in: 'board' })).toBeDefined()
  })

  test('a post naming a path outside the list reads nothing', async ($, on) => {
    const w = world(on)
    await issue($, '')
    const m = await mounted($)
    await m.post({ open: 'pm/cc-plugins/../x.md' }, { in: 'board' })
    await w.clock.settle()
    expect(runsOf(w, 'read')).toHaveLength(0)
    await m.post({ open: 'pm/cc-plugins/tasks/a.md' }, { in: 'board' })
    await w.clock.settle()
    expect(runsOf(w, 'read')).toHaveLength(1)
  })

  test('card text stays within draw bounds', async ($, on) => {
    const CR = String.fromCharCode(13)
    const w = world(on, { read: `---\ntitle: "a${CR}b"\nstatus: ${'s'.repeat(11000)}\n---\n${'x'.repeat(11000)}` })
    const m = await openFirstRow($, w)
    const card = clientNode(await $.ui.render(PANE)).props.props.card
    expect(card.body.length).toBe(10000)
    expect(card.clip).toBe('Clipped: showing 10000 of 11000 characters.')
    const texts = await m.findAll({ type: 'Text', in: 'board' })
    expect(texts.some((text: any) => text.text === 'ab')).toBe(true)
    for (const text of texts) {
      expect(text.text.length).toBeLessThanOrEqual(10000)
      expect(text.text.includes(CR)).toBe(false)
    }
  })
})

describe('back to the list', () => {
  async function openAndGoBack($: any, w: any) {
    await issue($, '')
    const m = await mounted($)
    await m.key({ key: 'down', in: 'board' })
    await m.key({ key: 'return', in: 'board' })
    await w.clock.settle()
    await m.redraw()
    await m.key({ key: 'left', in: 'board' })
    await w.clock.settle()
    await m.redraw()
    return m
  }

  test('left on an opened card returns to the list where it was left', async ($, on) => {
    const w = world(on)
    const m = await openAndGoBack($, w)
    const props = clientNode(await $.ui.render(PANE)).props.props
    expect(props.card).toBe(null)
    expect(props.groups[0].status).toBe('todo')
    const texts = await m.findAll({ type: 'Text', in: 'board' })
    expect(texts.some((text: any) => text.text.endsWith('  2/2'))).toBe(true)
  })

  test('a read still running when left arrives never lands', async ($, on) => {
    const w = world(on, { read: 'defer' })
    await openAndGoBack($, w)
    w.release(2, CARD)
    await w.clock.settle()
    expect(clientNode(await $.ui.render(PANE)).props.props.card).toBe(null)
  })

  test('back leaves a card /issue asked for in place', async ($, on) => {
    const w = world(on, { read: CARD })
    await issue($, 'a')
    const m = await mounted($)
    await m.post({ back: true }, { in: 'board' })
    await w.clock.settle()
    expect(nodesOf(await $.ui.render(PANE), 'Markdown')).toHaveLength(1)
  })
})

describe('a card /issue asked for', () => {
  const MOD = 'mod-obw-issue-pane'
  const MOD_PATH = `pm/cc-plugins/tasks/${MOD}.md`
  const ROWS = JSON.stringify([MOD_PATH, P('other')].map((path) => ({ path, status: 'todo' })))

  test('draws below a compact list', async ($, on) => {
    world(on, { query: ROWS, read: CARD })
    await issue($, MOD)
    const tree = await $.ui.render(PANE)
    expect(clientNode(tree).props.height).toBe(8)
    expect(clientNode(tree).props.props.rows).toBe(8)
    expect(stringsIn(headerIn(tree)).join('')).toBe('status: todo · priority: medium · AC 0/1')
    const flat = JSON.stringify(tree)
    expect(flat.indexOf('"type":"Client"')).toBeLessThan(flat.indexOf('"type":"Markdown"'))
  })

  test('opening a row moves the card into a full-height list region', async ($, on) => {
    const w = world(on, { query: ROWS, read: CARD })
    await issue($, MOD)
    const m = await mounted($)
    await m.key({ key: 'down', in: 'board' })
    await m.key({ key: 'down', in: 'board' })
    await m.key({ key: 'return', in: 'board' })
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(runsOf(w, 'read').map((run: any) => run.argv[3])).toEqual([`path=${MOD_PATH}`, `path=${P('other')}`])
    expect(nodesOf(tree, 'Markdown')).toHaveLength(0)
    expect(clientNode(tree).props.height).toBe(29)
    expect(clientNode(tree).props.props.card.kind).toBe('shown')
  })

  test('desktop draws the card with no Button', async ($, on) => {
    vizWorld(on, { query: ROWS, read: CARD })
    await issue($, MOD)
    const tree = await $.ui.render({ ...PANE, surface: 'desktop' })
    expect(nodesOf(tree, 'Button')).toHaveLength(0)
    expect(nodesOf(tree, 'Markdown')).toHaveLength(1)
  })
})
