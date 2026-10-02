import { describe, expect, test } from 'claude-code/testing'
import { PANE, buttonOf, buttonsIn, elementsIn, headingKeys, issue, labelsOf, lineOf, nodesOf, pressKey, rowKeys, stringsIn, typeQuery, watchState } from './fixtures/pane.ts'
import { groupKey, listGroups, listItems, rowKey } from '../hooks/list.ts'
import { SESSION, world } from './fixtures/world.ts'
import { MIX, P } from './fixtures/rows.ts'
import { BACK_KEY, QUERY_KEY } from '../hooks/ring.ts'

const mix = (on: any, options: any = {}) => world(on, { query: JSON.stringify(MIX), ...options })
const rowOf = (name: string) => rowKey(P(name))

describe('the All Tasks Button list', () => {
  test('headings carry the status labels and counts, and only the first takes the focus', async ($, on) => {
    mix(on)
    await issue($, '')
    const tree = await $.ui.render(PANE)
    const headings = buttonsIn(tree).filter((node: any) => node.props.key.startsWith('group:'))
    expect(headings.map((node: any) => node.props.key)).toEqual([groupKey(0, 'todo'), groupKey(0, 'in-progress'), groupKey(0, 'blocked'), groupKey(0, 'done'), groupKey(0, 'waiting'), groupKey(0, '')])
    expect(labelsOf(headings)).toEqual(['todo', 'in-progress', 'blocked', 'done', 'waiting', 'no status'])
    expect(headings.map((node: any) => node.props.autoFocus === true)).toEqual([true, false, false, false, false, false])
    expect(headings.every((node: any) => node.props.plain === true)).toBe(true)
    expect(nodesOf(tree, 'Client')).toHaveLength(0)
  })

  test('rows are plain Buttons labelled with their titles, and a folded group draws none', async ($, on) => {
    mix(on)
    await issue($, '')
    const tree = await $.ui.render(PANE)
    const todo = buttonsIn(tree).filter((node: any) => [rowOf('b'), rowOf('a'), rowOf('i'), rowOf('j')].includes(node.props.key))
    expect(todo.map((node: any) => node.props.key)).toEqual([rowOf('b'), rowOf('a'), rowOf('i'), rowOf('j')])
    expect(labelsOf(todo)).toEqual(['b', 'a', 'i', 'j'])
    expect(todo.every((node: any) => node.props.plain === true)).toBe(true)
    expect(rowKeys(tree)).not.toContain(rowOf('e'))
    expect(rowKeys(tree)).not.toContain(rowOf('f'))
  })

  test('a heading is followed by its count', async ($, on) => {
    mix(on)
    await issue($, '')
    const tree = await $.ui.render(PANE)
    const heading = lineOf(tree, groupKey(0, 'todo'))
    expect(stringsIn(heading)).toEqual(['▾ ', '● ', '  4'])
  })

  test('every surface draws the same headings and no card Select', async ($, on) => {
    mix(on)
    await issue($, '')
    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile']) {
      const tree = await $.ui.render({ ...PANE, surface })
      expect(headingKeys(tree)).toEqual([groupKey(0, 'todo'), groupKey(0, 'in-progress'), groupKey(0, 'blocked'), groupKey(0, 'done'), groupKey(0, 'waiting'), groupKey(0, '')])
      expect(nodesOf(tree, 'Select').filter((node: any) => node.props.key === 'cards')).toHaveLength(0)
    }
  })

  test('the list waits on the loading line with no Buttons', async ($, on) => {
    const w = world(on, { query: 'hang' })
    await $.session.start(SESSION)
    const done = $.command.run({ command: 'issue', args: '' })
    await w.clock.settle()
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).toEqual(['Reading the vault…'])
    expect(buttonsIn(tree)).toEqual([])
    await w.clock.advance(60000)
    await done
  })

  test('an empty view draws a dim notice and no list', async ($, on) => {
    world(on, { query: '[]' })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree)).toEqual([])
    expect(buttonOf(tree, 'priority')).toBeUndefined()
    const notice = nodesOf(tree, 'Text').find((node: any) => stringsIn(node).includes('No cards in the All Tasks view of pm/cc-plugins.'))
    expect(notice.props.dimColor).toBe(true)
  })

  test('a failed query draws its error and the view picker and no list', async ($, on) => {
    world(on, { query: { deny: 'spawn failed' } })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree)).toEqual([])
    const error = nodesOf(tree, 'Text').find((node: any) => stringsIn(node).some((text) => text.startsWith('The obsidian CLI did not run')))
    expect(error.props.color).toBe('error')
    expect(nodesOf(tree, 'Select').find((node: any) => node.props.key === 'views').props.value).toBe('All Tasks')
  })

  test('the hints line is subtle and leaves the filter out on mobile', async ($, on) => {
    mix(on)
    await issue($, '')
    const hints = (tree: any) => nodesOf(tree, 'Text').find((node: any) => stringsIn(node).some((text) => text.startsWith('↑↓ move')))
    expect(stringsIn(hints(await $.ui.render(PANE)))).toEqual(['↑↓ move · enter open or fold · f filter · esc close'])
    expect(hints(await $.ui.render(PANE)).props.color).toBe('subtle')
    expect(stringsIn(hints(await $.ui.render({ ...PANE, surface: 'mobile' })))).toEqual(['↑↓ move · enter open or fold · esc close'])
  })

  test('the list text never reaches the command result', async ($, on) => {
    world(on, { query: JSON.stringify([{ path: P('a'), status: 'todo', title: 'tt-marker' }]) })
    const result = await issue($, '')
    expect(result).toEqual({})
    expect(JSON.stringify(await $.ui.render(PANE))).toContain('tt-marker')
    expect(JSON.stringify(result)).not.toContain('tt-marker')
  })
})

const glyphBefore = (tree: any, key: string) => stringsIn(lineOf(tree, key))[0]

describe('folding', () => {
  test('done starts folded and todo unfolded', async ($, on) => {
    mix(on)
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(glyphBefore(tree, groupKey(0, 'done'))).toBe('▸ ')
    expect(rowKeys(tree)).not.toContain(rowOf('e'))
    expect(glyphBefore(tree, groupKey(0, 'todo'))).toBe('▾ ')
  })

  test('pressing a heading folds its group and pressing it again unfolds it', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await pressKey($, w, groupKey(0, 'todo'))
    let tree = await $.ui.render(PANE)
    expect(rowKeys(tree)).not.toContain(rowOf('b'))
    expect(glyphBefore(tree, groupKey(0, 'todo'))).toBe('▸ ')
    await pressKey($, w, groupKey(0, 'todo'))
    tree = await $.ui.render(PANE)
    expect(rowKeys(tree)).toContain(rowOf('b'))
  })

  test('unfolding done draws its rows', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await pressKey($, w, groupKey(0, 'done'))
    const tree = await $.ui.render(PANE)
    expect(rowKeys(tree).filter((key: string) => key === rowOf('f') || key === rowOf('e'))).toEqual([rowOf('f'), rowOf('e')])
  })
})

describe('the filter Input', () => {
  const ROWS = JSON.stringify([
    { path: P('s1'), status: 'todo', title: 'Spiral loop', tags: '#cf' },
    { path: P('s2'), status: 'done', title: 'other', tags: '#spiral, #x' },
    { path: P('n'), status: 'todo', title: 'nope', tags: '#a' },
    { path: P('late'), status: 'todo', title: 't', tags: '#a1, #a2, #a3, #a4, #a5, #a6, #a7, #a8, #a9, #a10, #zz-late' },
  ])

  test('a query narrows the list to matching titles or tags and the counts follow', async ($, on) => {
    const w = world(on, { query: ROWS })
    await issue($, '')
    await pressKey($, w, groupKey(0, 'done'))
    await typeQuery($, w, 'SPIRAL')
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree)).toEqual([groupKey(0, 'todo'), groupKey(0, 'done')])
    expect(stringsIn(lineOf(tree, groupKey(0, 'todo')))[2]).toBe('  1')
    expect(stringsIn(lineOf(tree, groupKey(0, 'done')))[2]).toBe('  1')
    expect(rowKeys(tree)).toEqual([rowOf('s1'), rowOf('s2')])
  })

  test('a tag past the drawn cut still matches', async ($, on) => {
    const w = world(on, { query: ROWS })
    await issue($, '')
    await typeQuery($, w, 'zz-late')
    expect(rowKeys(await $.ui.render(PANE))).toEqual([rowOf('late')])
  })

  test('a query matching nothing says so and keeps the toolbar', async ($, on) => {
    const w = world(on, { query: ROWS })
    await issue($, '')
    await typeQuery($, w, 'qqq')
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree)).toEqual([])
    expect(stringsIn(tree)).toContain('› no cards match')
    expect(buttonOf(tree, 'priority')).toBeDefined()
  })

  test('the query is kept as typed, trailing space included', async ($, on) => {
    const w = world(on, { query: ROWS })
    const state = watchState(on)
    await issue($, '')
    await typeQuery($, w, 'a ')
    expect(state.latest('list').query).toBe('a ')
    expect(nodesOf(await $.ui.render(PANE), 'Input')[0].props.value).toBe('a ')
  })

  test('Enter and the filter Button leave the list drawn when the engine refuses the focus', async ($, on) => {
    const w = world(on, { query: ROWS })
    await issue($, '')
    await typeQuery($, w, 'nope', 'submit')
    await pressKey($, w, 'focus-query')
    expect(rowKeys(await $.ui.render(PANE))).toEqual([rowOf('n')])
  })

  test('the toolbar holds the filter Button and the Input', async ($, on) => {
    mix(on)
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(buttonOf(tree, 'focus-query').props.hotkey).toBe('f')
    expect(buttonOf(tree, 'focus-query').props.label).toBe('filter')
    const input = nodesOf(tree, 'Input')[0]
    expect(input.props.key).toBe(QUERY_KEY)
    expect(input.props.placeholder).toBe('tag or title')
  })

  test('mobile leaves out the Input and the filter Button', async ($, on) => {
    mix(on)
    await issue($, '')
    const tree = await $.ui.render({ ...PANE, surface: 'mobile' })
    expect(nodesOf(tree, 'Input')).toHaveLength(0)
    expect(buttonOf(tree, 'focus-query')).toBeUndefined()
    expect(buttonOf(tree, 'priority')).toBeDefined()
    expect(buttonOf(tree, 'sort')).toBeDefined()
  })
})

describe('the priority and sort Buttons', () => {
  test('priority is dim with the p hotkey while unfiltered', async ($, on) => {
    mix(on)
    await issue($, '')
    const button = buttonOf(await $.ui.render(PANE), 'priority')
    expect(button.props.hotkey).toBe('p')
    expect(button.props.label).toBe('priority all')
    expect(button.props.dimColor).toBe(true)
  })

  test('priority cycles through high, medium, low and back to all', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    const steps: [string, string[]][] = [
      ['priority high', [rowOf('b')]],
      ['priority medium', [rowOf('a'), rowOf('g')]],
      ['priority low', [rowOf('c'), rowOf('h')]],
      ['priority all', []],
    ]
    for (const [label, rows] of steps) {
      await pressKey($, w, 'priority')
      const tree = await $.ui.render(PANE)
      expect(buttonOf(tree, 'priority').props.label).toBe(label)
      if (rows.length) expect(rowKeys(tree)).toEqual(rows)
    }
  })

  test('a priority no card has says so and offers clear', async ($, on) => {
    const w = world(on, { query: JSON.stringify([{ path: P('a'), status: 'todo', priority: 'medium' }]) })
    await issue($, '')
    await pressKey($, w, 'priority')
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).toContain('› no cards match')
    expect(buttonOf(tree, 'clear')).toBeDefined()
  })

  test('sort switches each group between priority and title order', async ($, on) => {
    const rows = [
      { path: P('z'), status: 'todo', priority: 'high', title: 'zeta' },
      { path: P('m'), status: 'todo', priority: 'low', title: 'alpha' },
      { path: P('k'), status: 'todo', priority: 'medium', title: 'kappa' },
    ]
    const w = world(on, { query: JSON.stringify(rows) })
    await issue($, '')
    let tree = await $.ui.render(PANE)
    expect(rowKeys(tree)).toEqual([rowOf('z'), rowOf('k'), rowOf('m')])
    expect(buttonOf(tree, 'sort').props.hotkey).toBe('s')
    expect(buttonOf(tree, 'sort').props.label).toBe('sort priority')
    await pressKey($, w, 'sort')
    tree = await $.ui.render(PANE)
    expect(buttonOf(tree, 'sort').props.label).toBe('sort title')
    expect(rowKeys(tree)).toEqual([rowOf('m'), rowOf('k'), rowOf('z')])
    await pressKey($, w, 'sort')
    expect(rowKeys(await $.ui.render(PANE))).toEqual([rowOf('z'), rowOf('k'), rowOf('m')])
  })
})

describe('clearing the filters', () => {
  test('clear is drawn only while a filter is set', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    expect(buttonOf(await $.ui.render(PANE), 'clear')).toBeUndefined()
    await pressKey($, w, 'priority')
    expect(buttonOf(await $.ui.render(PANE), 'clear').props.hotkey).toBe('x')
  })

  test('clear removes the text and priority filters and leaves the sort', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await issue($, '')
    await typeQuery($, w, 'a')
    await pressKey($, w, 'priority')
    await pressKey($, w, 'sort')
    await pressKey($, w, 'clear')
    const value = state.latest('list')
    expect(value.query).toBe('')
    expect(value.priority).toBe(null)
    expect(value.sort).toBe('title')
    expect(buttonOf(await $.ui.render(PANE), 'clear')).toBeUndefined()
  })
})

describe('the list budget', () => {
  const quotes = '"'.repeat(11000)
  const WORST = JSON.stringify(
    Array.from({ length: 150 }, (_, n) => ({
      path: P(`${n}`.padStart(3, '0').padEnd(200 - P('').length, '"')),
      status: `${n}`.padEnd(11000, '"'),
      priority: 'high',
      title: quotes,
      tags: quotes,
    })),
  )

  test('a worst-case list stays under the tree bound and counts what it left out', async ($, on) => {
    world(on, { query: WORST })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(JSON.stringify(tree).length).toBeLessThanOrEqual(100000)
    const more = nodesOf(tree, 'Text').find((node: any) => /^\d+ more not shown$/.test(stringsIn(node).join('')))
    expect(more.props.dimColor).toBe(true)
  })

  test('the keys drawn are the keys listItems walks', async ($, on) => {
    world(on, { query: WORST })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    const rows = JSON.parse(WORST)
    const { groups } = listGroups('cc-plugins', rows)
    const expected = listItems(groups, { query: '', priority: null, sort: 'priority', folded: [groupKey(0, 'done')] }).items.map((item) => item.key)
    const drawn = buttonsIn(tree).map((node: any) => node.props.key).filter((key: string) => key.startsWith('group:') || key.startsWith('row:'))
    expect(drawn).toEqual(expected)
  })

  test('a realistic vault with done unfolded draws every card', async ($, on) => {
    const cjk = ['整理 obw 面板', '重構 Client 為按鈕清單', '中文標題 with english words']
    const rows = [
      ...Array.from({ length: 54 }, (_, n) => ({ path: `pm/cc-plugins/tasks/archive/d${n}.md`, status: 'done', priority: 'low', title: `${cjk[n % 3]} ${n}`.padEnd(35, 'x'), tags: '#cf, #adr' })),
      ...Array.from({ length: 7 }, (_, n) => ({ path: P(`t${n}`), status: 'todo', priority: 'medium', title: `todo card number ${n}`.padEnd(32, 'x'), tags: '#cf, #adr' })),
      { path: P('w'), status: 'in-progress', priority: 'high', title: 'a card in progress'.padEnd(30, 'x'), tags: '#cf' },
    ]
    const w = world(on, { query: JSON.stringify(rows) })
    await issue($, '')
    await pressKey($, w, groupKey(0, 'done'))
    const tree = await $.ui.render(PANE)
    expect(rowKeys(tree)).toHaveLength(62)
    expect(stringsIn(tree).some((text: string) => text.includes('more not shown'))).toBe(false)
  })
})

describe('bounded list text', () => {
  test('long and control-bearing vault text is drawn cut and clean', async ($, on) => {
    world(on, { query: JSON.stringify([{ path: P('a'), status: 't\rodo', title: 'x'.repeat(11000), tags: '#a\r#b' }]) })
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(stringsIn(tree)).not.toContain('obw: the card could not be drawn.')
    const strings = [...stringsIn(tree), ...labelsOf(buttonsIn(tree))]
    for (const text of strings) {
      expect(text.length).toBeLessThanOrEqual(10000)
      expect(text.includes('\r')).toBe(false)
    }
    expect(strings).toContain('todo')
    expect(strings).toContain('#a#b')
  })
})

describe('the filter reaches past the drawn cut', () => {
  test('matches the full tags and the full title, past 1000 characters', async ($, on) => {
    const rows = [
      { path: P('a'), status: 'todo', title: 'short', tags: '#' + 'x'.repeat(999) + ', #zz-end' },
      { path: P('b'), status: 'todo', title: 'y'.repeat(1001) + ' zz-title-end' },
    ]
    const w = world(on, { query: JSON.stringify(rows) })
    await issue($, '')
    await typeQuery($, w, 'zz-end')
    expect(rowKeys(await $.ui.render(PANE))).toEqual([rowKey(P('a'))])
    await typeQuery($, w, 'zz-title-end')
    expect(rowKeys(await $.ui.render(PANE))).toEqual([rowKey(P('b'))])
  })
})

describe('a pane body of one column', () => {
  test('draws the list and the card view with no negative width', async ($, on) => {
    const w = world(on)
    await issue($, '')
    const narrow = { ...PANE, props: { ...PANE.props, bodyColumns: 1 } }
    const widths = (tree: any) => elementsIn(tree).map((node: any) => node.props?.width).filter((width: unknown) => width !== undefined)
    const list = await $.ui.render(narrow)
    expect(headingKeys(list).length).toBeGreaterThan(0)
    expect(widths(list).every((width: number) => width >= 0)).toBe(true)
    await $.ui.press({ plugin: 'obw', key: rowKey(P('a')) })
    await w.clock.settle()
    const card = await $.ui.render(narrow)
    expect(buttonOf(card, BACK_KEY)).toBeDefined()
    expect(widths(card).every((width: number) => width >= 0)).toBe(true)
  })
})
