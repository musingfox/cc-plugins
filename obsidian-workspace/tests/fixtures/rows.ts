import { groupKey } from '../../hooks/list.ts'

export const P = (name: string) => `pm/cc-plugins/tasks/${name}.md`

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

// The list atom's initial value: nothing filtered, priority order, `done` folded.
export const LIST_START = { query: '', priority: null, sort: 'priority', folded: [groupKey(0, 'done')] } as const
