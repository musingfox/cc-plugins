import { isBadCardPath } from './base-argv.ts'
import { bounded } from './bounds.ts'

type Row = { path: string; status?: string | null }
type ListRow = { path: string; label: string; status: string | null }

export function resolveArgument(argument: string, views: string[]): { kind: 'none' } | { kind: 'view'; view: string } | { kind: 'card'; card: string } {
  if (!argument.trim()) return { kind: 'none' }
  return views.includes(argument) ? { kind: 'view', view: argument } : { kind: 'card', card: argument }
}

export function listRows(project: string, rows: Row[]): ListRow[] {
  const paths = new Set<string>()
  const grouped = new Map<string, ListRow[]>()
  const withoutStatus: ListRow[] = []
  for (const row of rows) {
    if (paths.has(row.path) || isBadCardPath(project, row.path)) continue
    paths.add(row.path)
    const status = typeof row.status === 'string' ? row.status : null
    const name = row.path.slice(row.path.lastIndexOf('/') + 1, -'.md'.length)
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
export function rowsOutside(project: string, rows: Row[]) {
  return rows.filter((row) => isBadCardPath(project, row.path)).length
}

export function rowSlug(project: string, path: string) {
  return path.slice(`pm/${project}/`.length, -'.md'.length).replaceAll('/', '-')
}
