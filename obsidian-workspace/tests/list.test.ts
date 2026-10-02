import { describe, expect, test } from 'claude-code/testing'
import { countRows } from '../hooks/counts.ts'
import { LIST_BUDGET, listGroups, listItems } from '../hooks/list.ts'
import { LIST_START, MIX, P } from './fixtures/rows.ts'

test('groups rows by status in schema order, each sorted by priority', () => {
  const { groups } = listGroups('cc-plugins', MIX)
  expect(groups.map((group) => group.status)).toEqual(['todo', 'in-progress', 'blocked', 'done', 'waiting', null])
  expect(groups.map((group) => group.count)).toEqual([4, 1, 1, 2, 1, 1])
  expect(groups[0].rows.map((row) => row.path)).toEqual([P('b'), P('a'), P('i'), P('j')])
  expect(groups[0].rows.map((row) => row.badge)).toEqual(['H', 'M', ' ', ' '])
  expect(groups[3].rows.map((row) => row.path)).toEqual([P('f'), P('e')])
})

test('gives a priority named after an Object prototype key a blank badge', () => {
  const rows = ['constructor', 'toString', '__proto__'].map((priority, i) => ({ path: P(`p${i}`), status: 'todo', priority }))
  const { groups } = listGroups('cc-plugins', rows)
  expect(groups[0].rows.map((row) => row.badge)).toEqual([' ', ' ', ' '])
})

test('group counts match countRows over the same rows', () => {
  const counted = countRows('cc-plugins', MIX)
  const { groups } = listGroups('cc-plugins', MIX)
  for (const group of groups) {
    expect(group.count).toBe(
      group.status === null ? counted.status.missing : counted.status.values.find((entry) => entry.value === group.status)!.count,
    )
  }
  expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(counted.total)
  expect(counted.total).toBe(10)
})

test('treats empty, null and absent status as one missing group', () => {
  const { groups } = listGroups('cc-plugins', [{ path: P('a'), status: '' }, { path: P('b'), status: null }, { path: P('c') }])
  expect(groups.map(({ status, count }) => ({ status, count }))).toEqual([{ status: null, count: 3 }])
})

test('an empty listing or one outside the project has no groups', () => {
  expect(listGroups('cc-plugins', [])).toEqual({ groups: [], hidden: 0 })
  expect(listGroups('cc-plugins', [{ path: 'pm/other/tasks/x.md', status: 'todo' }])).toEqual({ groups: [], hidden: 0 })
})

test('an empty title falls back to the file name', () => {
  const { groups } = listGroups('cc-plugins', [{ path: P('a'), title: '' }, { path: P('b'), title: '中文' }])
  expect(groups[0].rows.map((row) => row.title)).toEqual(['a', '中文'])
})

test('keeps every row of a long listing', () => {
  const rows = Array.from({ length: 150 }, (_, n) => ({ path: P(`r${n}`), status: 'todo' }))
  const { groups, hidden } = listGroups('cc-plugins', rows)
  expect(groups[0].rows.length).toBe(150)
  expect(hidden).toBe(0)
  expect(groups[0].count).toBe(150)
})

test('bounds and caps the drawn fields', () => {
  const { groups } = listGroups('cc-plugins', [{ path: P('a'), status: 'a\rb', title: 'x'.repeat(11000), tags: 'c\rd' }])
  expect(groups[0].status).toBe('ab')
  expect(groups[0].rows[0].title.length).toBe(80)
  expect(groups[0].rows[0].tags).toBe('cd')
})

test('keeps each drawn field on one line', () => {
  const { groups } = listGroups('cc-plugins', [{ path: P('a'), status: 'x\ny', title: 'a\n\nb', due: '1\t2', tags: 'c\td' }])
  expect(groups[0].status).toBe('x y')
  expect(groups[0].rows[0]).toMatchObject({ title: 'a b', due: '1 2', tags: 'c d' })
})

test('marks a status cut to the cap', () => {
  const { groups } = listGroups('cc-plugins', [{ path: P('a'), status: 'x'.repeat(40) }, { path: P('b'), status: 'y'.repeat(32) }])
  expect(groups.map((group) => group.status)).toEqual(['x'.repeat(31) + '…', 'y'.repeat(32)])
})

test('a row with a path longer than 200 characters is hidden', () => {
  const path = P('a'.repeat(201 - P('').length))
  expect(path.length).toBe(201)
  expect(listGroups('cc-plugins', [{ path, status: 'todo' }])).toEqual({ groups: [], hidden: 1 })
})

const keysOfItems = (groups: ReturnType<typeof listGroups>['groups'], list: object = {}) =>
  listItems(groups, { ...LIST_START, ...list } as any).items.map((item) => item.key)

describe('heading and row keys', () => {
  test('two statuses cut to the same label keep different keys', () => {
    const rows = [{ path: P('a'), status: 'x'.repeat(40) }, { path: P('b'), status: 'x'.repeat(41) }]
    expect(listGroups('cc-plugins', rows).groups.map((group) => group.key)).toEqual([
      'group:0:' + 'x'.repeat(31) + '…',
      'group:1:' + 'x'.repeat(31) + '…',
    ])
  })

  test('a missing status keys as an empty label and a done row as done', () => {
    expect(listGroups('cc-plugins', [{ path: P('a') }]).groups[0].key).toBe('group:0:')
    expect(listGroups('cc-plugins', [{ path: P('a'), status: 'done' }]).groups[0].key).toBe('group:0:done')
  })

  test('a filter hiding the first group leaves the second keyed as before', () => {
    const rows = [
      { path: P('a'), status: 'x'.repeat(40), title: 'first' },
      { path: P('b'), status: 'x'.repeat(41), title: 'second' },
    ]
    const { groups } = listGroups('cc-plugins', rows)
    expect(keysOfItems(groups, { query: 'second', folded: [] })).toEqual(['group:1:' + 'x'.repeat(31) + '…', `row:${P('b')}`])
  })

  test('no key holds a control character', () => {
    const { groups } = listGroups('cc-plugins', MIX)
    const keys = [...groups.map((group) => group.key), ...groups.flatMap((group) => group.rows.map((row) => row.key))]
    expect(keys.some((key) => /[\x00-\x1f\x7f-\x9f]/.test(key))).toBe(false)
  })

  test('the same name in two folders keys by path', () => {
    const rows = [{ path: P('a'), status: 'todo' }, { path: 'pm/cc-plugins/tasks/archive/a.md', status: 'todo' }]
    const { groups } = listGroups('cc-plugins', rows)
    expect(groups[0].rows.map((row) => row.key)).toEqual(['row:pm/cc-plugins/tasks/a.md', 'row:pm/cc-plugins/tasks/archive/a.md'])
  })
})

describe('listItems', () => {
  const { groups } = listGroups('cc-plugins', MIX)

  test('draws headings with rows and leaves the done group folded', () => {
    const items = listItems(groups, LIST_START as any).items
    expect(items.filter((item) => item.kind === 'heading').map((item) => item.key)).toEqual([
      'group:0:todo',
      'group:0:in-progress',
      'group:0:blocked',
      'group:0:done',
      'group:0:waiting',
      'group:0:',
    ])
    expect(items.some((item) => item.kind === 'row' && item.key === `row:${P('e')}`)).toBe(false)
    expect(items.find((item) => item.kind === 'heading' && item.key === 'group:0:done')).toMatchObject({ open: false, count: 2 })
  })

  test('folding the todo group leaves its heading and drops its rows', () => {
    const keys = keysOfItems(groups, { folded: ['group:0:todo', 'group:0:done'] })
    expect(keys.includes('group:0:todo')).toBe(true)
    expect(keys.includes(`row:${P('b')}`)).toBe(false)
  })

  test('unfolding done draws its rows in priority order', () => {
    const keys = keysOfItems(groups, { folded: [] })
    expect(keys.slice(keys.indexOf('group:0:done') + 1, keys.indexOf('group:0:done') + 3)).toEqual([`row:${P('f')}`, `row:${P('e')}`])
  })

  const filterRows = [
    { path: P('s1'), status: 'todo', title: 'Spiral loop', tags: '#cf' },
    { path: P('s2'), status: 'done', title: 'other', tags: '#spiral, #x' },
    { path: P('n'), status: 'todo', title: 'nope', tags: '#a' },
    { path: P('late'), status: 'todo', title: 't', tags: '#a1, #a2, #a3, #a4, #a5, #a6, #a7, #a8, #a9, #a10, #zz-late' },
  ]
  const filtered = listGroups('cc-plugins', filterRows).groups

  test('a query matches the title or the tags, ignoring case, and the counts follow', () => {
    const { items } = listItems(filtered, { ...LIST_START, query: 'SPIRAL', folded: [] } as any)
    expect(items.map((item) => item.key)).toEqual(['group:0:todo', `row:${P('s1')}`, 'group:0:done', `row:${P('s2')}`])
    expect(items.filter((item) => item.kind === 'heading').map((item) => (item as any).count)).toEqual([1, 1])
  })

  test('a tag past the drawn cut still matches', () => {
    expect(keysOfItems(filtered, { query: 'zz-late' })).toEqual(['group:0:todo', `row:${P('late')}`])
  })

  test('a blank query filters nothing and a query is trimmed', () => {
    expect(keysOfItems(filtered, { query: '   ' })).toEqual(keysOfItems(filtered))
    expect(keysOfItems(filtered, { query: ' nope ' })).toEqual(['group:0:todo', `row:${P('n')}`])
  })

  test('a query matching nothing leaves no item', () => {
    expect(listItems(filtered, { ...LIST_START, query: 'qqq' } as any)).toEqual({ items: [], hidden: 0 })
  })

  test('a priority keeps only the rows with that raw priority', () => {
    const rows = listItems(groups, { ...LIST_START, priority: 'medium', folded: [] } as any).items.filter((item) => item.kind === 'row')
    expect(rows.map((item) => item.key)).toEqual([`row:${P('a')}`, `row:${P('g')}`])
  })

  test('sorting by title orders each group by title and back by priority', () => {
    const rows = [
      { path: P('z'), status: 'todo', priority: 'high', title: 'zeta' },
      { path: P('m'), status: 'todo', priority: 'low', title: 'alpha' },
      { path: P('k'), status: 'todo', priority: 'medium', title: 'kappa' },
    ]
    const { groups: todo } = listGroups('cc-plugins', rows)
    const order = (sort: string) => keysOfItems(todo, { sort }).slice(1)
    expect(order('priority')).toEqual([P('z'), P('k'), P('m')].map((path) => `row:${path}`))
    expect(order('title')).toEqual([P('m'), P('k'), P('z')].map((path) => `row:${path}`))
  })

  test('a long listing is cut before the budget and counts what it left out', () => {
    const rows = Array.from({ length: 400 }, (_, n) => ({ path: P(`r${n}`), status: 'todo', title: 'x'.repeat(80), tags: 'y'.repeat(48) }))
    const { groups: many } = listGroups('cc-plugins', rows)
    const { items, hidden } = listItems(many, LIST_START as any)
    expect(items.length).toBeGreaterThan(10)
    expect(items.length - 1 + hidden).toBe(400)
    expect(hidden).toBeGreaterThan(0)
    expect(LIST_BUDGET).toBe(80000)
  })

  test('a heading the budget leaves out takes every row under it into the count', () => {
    const rows = Array.from({ length: 150 }, (_, n) => ({ path: P(`r${n}`), status: `s${n}`.padEnd(40, '"'), title: '"'.repeat(80) }))
    const { groups: many } = listGroups('cc-plugins', rows)
    const { items, hidden } = listItems(many, { ...LIST_START, folded: [] } as any)
    expect(items.filter((item) => item.kind === 'row').length + hidden).toBe(150)
    expect(items.filter((item) => item.kind === 'heading').length).toBeLessThan(150)
    expect(hidden).toBeGreaterThan(0)
  })
})
