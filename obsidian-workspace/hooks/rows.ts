import { projectRoot, taskFolder } from './argv.ts'
import { isBadCardPath } from './base-argv.ts'
import { bounded } from './bounds.ts'

type Row = { path: string; status?: string | null }
type ListRow = { path: string; label: string; status: string | null }

export function resolveArgument(argument: string, views: string[]): { kind: 'none' } | { kind: 'view'; view: string } | { kind: 'card'; card: string } {
  if (!argument.trim()) return { kind: 'none' }
  return views.includes(argument) ? { kind: 'view', view: argument } : { kind: 'card', card: argument }
}

function cardName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1, -'.md'.length)
}

// The row an argument names: a view can list a card from any folder under the project, so the name the
// pane drew is the one to match. Two folders can spell one name, and the task folder keeps it.
export function rowNamed(rows: ListRow[], project: string, name: string): string | null {
  const named = rows.filter((row) => cardName(row.path) === name)
  const task = `${taskFolder(project)}${name}.md`
  if (named.some((row) => row.path === task)) return task
  return named.length ? named[0].path : null
}

export function listRows(project: string, rows: Row[]): ListRow[] {
  const paths = new Set<string>()
  const grouped = new Map<string, ListRow[]>()
  const withoutStatus: ListRow[] = []
  for (const row of rows) {
    if (paths.has(row.path) || isBadCardPath(project, row.path)) continue
    paths.add(row.path)
    const status = typeof row.status === 'string' ? row.status : null
    const name = cardName(row.path)
    const listed = { path: row.path, label: bounded(status ? `${status} · ${name}` : name).text, status }
    if (status === null) withoutStatus.push(listed)
    else {
      const group = grouped.get(status)
      if (group) group.push(listed)
      else grouped.set(status, [listed])
    }
  }
  return [...grouped.values()].flat().concat(withoutStatus)
}

// Rows the dashboard sent that no card path can be built from: a filter widened past the project, or a row that is not a note.
// Counted by path, as the list itself is: a path the view sent twice is one row left out, not two.
export function rowsOutside(project: string, rows: Row[]) {
  return new Set(rows.filter((row) => isBadCardPath(project, row.path)).map((row) => row.path)).size
}

export function rowSlug(project: string, path: string) {
  return path.slice(projectRoot(project).length, -'.md'.length).replaceAll('/', '-')
}
