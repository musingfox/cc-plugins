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
