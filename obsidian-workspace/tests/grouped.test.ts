import { expect, test } from 'claude-code/testing'
import { groupedOptions } from '../hooks/grouped.ts'

const P = (name: string) => `pm/cc-plugins/tasks/${name}.md`

export const MIX = [
  { path: P('g'), status: 'waiting', priority: 'medium' },
  { path: P('a'), status: 'todo', priority: 'medium' },
  { path: P('b'), status: 'todo', priority: 'high' },
  { path: P('c'), status: 'in-progress', priority: 'low' },
  { path: P('d'), status: 'blocked' },
  { path: P('e'), status: 'done', priority: 'low' },
  { path: P('f'), status: 'done', priority: 'high' },
  { path: P('h'), priority: 'low' },
  { path: P('i'), status: 'todo', priority: 'urgent' },
  { path: P('j'), status: 'todo' },
  { path: 'pm/other/tasks/x.md', status: 'todo', priority: 'high' },
  { path: P('a'), status: 'todo', priority: 'medium' },
]

export const GROUPED_MIX = [
  { value: '#0', label: 'todo (4)' },
  { value: '#p0.0', label: '  high' },
  { value: P('b'), label: '    b' },
  { value: '#p0.1', label: '  medium' },
  { value: P('a'), label: '    a' },
  { value: '#p0.2', label: '  urgent' },
  { value: P('i'), label: '    i' },
  { value: '#p0.3', label: '  —' },
  { value: P('j'), label: '    j' },
  { value: '#1', label: 'in-progress (1)' },
  { value: '#p1.0', label: '  low' },
  { value: P('c'), label: '    c' },
  { value: '#2', label: 'blocked (1)' },
  { value: '#p2.0', label: '  —' },
  { value: P('d'), label: '    d' },
  { value: '#3', label: 'done (2)' },
  { value: '#4', label: 'waiting (1)' },
  { value: '#p4.0', label: '  medium' },
  { value: P('g'), label: '    g' },
  { value: '#5', label: '— (1)' },
  { value: '#p5.0', label: '  low' },
  { value: P('h'), label: '    h' },
]

test('groups statuses in schema order then unnamed then missing', () =>
  expect(groupedOptions('cc-plugins', MIX)).toEqual(GROUPED_MIX))

test('treats empty, null and absent status as missing', () =>
  expect(
    groupedOptions('cc-plugins', [
      { path: P('a'), status: '' },
      { path: P('b'), status: null },
      { path: P('c') },
    ]),
  ).toEqual([
    { value: '#0', label: '— (3)' },
    { value: '#p0.0', label: '  —' },
    { value: P('a'), label: '    a' },
    { value: P('b'), label: '    b' },
    { value: P('c'), label: '    c' },
  ]))

test('drops empty listings and rows outside the project', () => {
  expect(groupedOptions('cc-plugins', [])).toEqual([])
  expect(groupedOptions('cc-plugins', [{ path: 'pm/other/tasks/x.md', status: 'todo' }])).toEqual([])
})

test('orders priority sub-headings high, medium, low, then unnamed, then missing', () => {
  const options = groupedOptions('cc-plugins', [
    { path: P('a'), status: 'todo', priority: 'low' },
    { path: P('b'), status: 'todo', priority: 'zeta' },
    { path: P('c'), status: 'todo' },
    { path: P('d'), status: 'todo', priority: 'high' },
    { path: P('e'), status: 'todo', priority: 'alpha' },
    { path: P('f'), status: 'todo', priority: 'zeta' },
    { path: P('g'), status: 'todo', priority: 'high' },
  ])
  expect(options[0]).toEqual({ value: '#0', label: 'todo (7)' })
  expect(options.slice(1).map((option) => option.label)).toEqual([
    '  high',
    '    d',
    '    g',
    '  low',
    '    a',
    '  zeta',
    '    b',
    '    f',
    '  alpha',
    '    e',
    '  —',
    '    c',
  ])
  expect(options.filter((option) => option.value.startsWith('#p')).map((option) => option.value)).toEqual([
    '#p0.0',
    '#p0.1',
    '#p0.2',
    '#p0.3',
    '#p0.4',
  ])
})

test('draws only the priorities that have a card', () =>
  expect(groupedOptions('cc-plugins', [{ path: P('a'), status: 'todo', priority: 'medium' }])).toEqual([
    { value: '#0', label: 'todo (1)' },
    { value: '#p0.0', label: '  medium' },
    { value: P('a'), label: '    a' },
  ]))
