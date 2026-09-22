import { describe, expect, test } from 'claude-code/testing'
import { PANE, cardSelect, clientNode, expectDrawn, issue, mounted, nodesOf, pick, stringsIn, viewSelect } from './fixtures/pane.ts'
import { SESSION, world } from './fixtures/world.ts'
import { MIX, P } from './fixtures/rows.ts'

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
