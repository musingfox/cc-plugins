import { bounded, MAX_CHARS } from './bounds.ts'
import { countRows, isMissing } from './counts.ts'
import { cardName, keptRows } from './rows.ts'
import { PRIORITY_ORDER, STATUS_ORDER } from './style.ts'
import type { ObwGroup, ObwList, ObwRow } from '../types/index.d.ts'

type Row = { path: string; status?: string | null; priority?: string | null; title?: string | null; tags?: string | null }

export type BoardRow = ObwRow
export type BoardGroup = ObwGroup

// The one place a list item's focus address is built and told apart.
export const rowKey = (path: string) => `row:${path}`
export const groupKey = (n: number, label: string) => `group:${n}:${label}`
export const isListKey = (key: string) => key.startsWith('row:') || key.startsWith('group:')

export type ListSettings = ObwList

export type Item =
  | { kind: 'heading'; key: string; label: string; status: string | null; count: number; open: boolean }
  | { kind: 'row'; key: string; row: BoardRow }

const BADGES: Record<string, BoardRow['badge']> = { high: 'H', medium: 'M', low: 'L' }
const MAX_PATH = 200
const MAX_TITLE = 80
const MAX_TAGS = 48
const MAX_STATUS = 32
// What the filter matches against is the CLI's own text up to the engine's string bound, the drawing far less.
// The engine refuses a $.state value over 4 MiB, so all the rows share this much match text; a row past it matches on its drawn cut.
const MAX_MATCH = MAX_CHARS
const MATCH_BUDGET = 500_000
// The engine bounds a tree at 100,000 serialized characters; the list keeps 20,000 of them for everything around it.
export const LIST_BUDGET = 80000
// An upper bound of what one heading or row draws besides its key, label and tags.
const ITEM_OVERHEAD = 900

// bounded keeps tab and newline; either would break a list line in two or skew its columns.
const oneLine = (text: string, max: number) => bounded(text, max).text.replace(/[\t\n]+/g, ' ')

// A cut status ends in …, so two statuses sharing a capped prefix are not taken for one.
function statusLabel(status: string) {
  return bounded(status, MAX_STATUS).clippedFrom === null ? oneLine(status, MAX_STATUS) : `${oneLine(status, MAX_STATUS - 1)}…`
}

function statusCount(counted: ReturnType<typeof countRows>, status: string | null) {
  return status === null ? counted.status.missing : counted.status.values.find((entry) => entry.value === status)!.count
}

function byPriority<R extends Row>(rows: R[]) {
  const buckets = new Map<string | null, R[]>()
  const extras: string[] = []
  for (const row of rows) {
    const priority = isMissing(row.priority) ? null : row.priority
    if (!buckets.has(priority)) {
      buckets.set(priority, [])
      if (priority !== null && !PRIORITY_ORDER.includes(priority)) extras.push(priority)
    }
    buckets.get(priority)!.push(row)
  }
  return [...PRIORITY_ORDER.filter((priority) => buckets.has(priority)), ...extras, ...(buckets.has(null) ? [null] : [])].flatMap(
    (priority) => buckets.get(priority)!,
  )
}

function boardRow(row: Row, room: number): BoardRow {
  const fullTitle = oneLine(row.title ?? '', Math.min(MAX_MATCH, Math.max(room, MAX_TITLE))) || oneLine(cardName(row.path), MAX_TITLE)
  const fullTags = oneLine(row.tags ?? '', Math.min(MAX_MATCH, Math.max(room - fullTitle.length, MAX_TAGS)))
  return {
    path: row.path,
    key: rowKey(row.path),
    badge: (typeof row.priority === 'string' && Object.hasOwn(BADGES, row.priority) && BADGES[row.priority]) || ' ',
    title: oneLine(row.title ?? '', MAX_TITLE) || oneLine(cardName(row.path), MAX_TITLE),
    tags: oneLine(row.tags ?? '', MAX_TAGS),
    fullTitle,
    fullTags,
    priority: isMissing(row.priority) ? null : oneLine(row.priority, MAX_STATUS),
  }
}

export function listGroups(project: string, rows: Row[]): { groups: BoardGroup[]; hidden: number } {
  const counted = countRows(project, rows)
  const kept = keptRows(project, rows)
  const named = counted.status.values.map((entry) => entry.value)
  const statuses: (string | null)[] = [
    ...STATUS_ORDER.filter((status) => named.includes(status)),
    ...named.filter((status) => !STATUS_ORDER.includes(status)),
    ...(counted.status.missing > 0 ? [null] : []),
  ]
  const groups: BoardGroup[] = []
  const labelled = new Map<string, number>()
  let hidden = 0
  let room = MATCH_BUDGET
  for (const status of statuses) {
    const ofStatus = byPriority(kept.filter((row) => (status === null ? isMissing(row.status) : row.status === status)))
    const drawn: BoardRow[] = []
    for (const row of ofStatus) {
      if (row.path.length > MAX_PATH) hidden++
      else {
        const made = boardRow(row, room)
        room -= made.fullTitle.length + made.fullTags.length
        drawn.push(made)
      }
    }
    if (!drawn.length) continue
    const label = status === null ? null : statusLabel(status)
    // `n` counts the earlier groups of the same label, so a cut status never shares a key and no filter moves one.
    const n = labelled.get(label ?? '') ?? 0
    labelled.set(label ?? '', n + 1)
    groups.push({ status: label, key: groupKey(n, label ?? ''), count: statusCount(counted, status), rows: drawn })
  }
  return { groups, hidden }
}

const cost = (...parts: string[]) => ITEM_OVERHEAD + parts.reduce((sum, part) => sum + JSON.stringify(part).length, 0)

// The heading and row items to draw, in order: filtered, ordered, unfolded, and cut before the item that would pass the budget.
export function listItems(groups: BoardGroup[], list: ListSettings): { items: Item[]; hidden: number } {
  const query = list.query.trim().toLowerCase()
  const matches = (row: BoardRow) =>
    (!list.priority || row.priority === list.priority) &&
    (!query || row.fullTitle.toLowerCase().includes(query) || row.fullTags.toLowerCase().includes(query))
  const items: Item[] = []
  let hidden = 0
  let spent = 0
  let full = false
  const place = (item: Item, size: number) => {
    if (!full && spent + size <= LIST_BUDGET) {
      items.push(item)
      spent += size
      return true
    }
    full = true
    return false
  }
  for (const group of groups) {
    const rows = group.rows.filter(matches)
    if (!rows.length) continue
    const open = !list.folded.includes(group.key)
    const ordered = list.sort === 'title' ? [...rows].sort((a, b) => a.fullTitle.localeCompare(b.fullTitle)) : rows
    const label = group.status ?? ''
    if (!place({ kind: 'heading', key: group.key, label, status: group.status, count: rows.length, open }, cost(group.key, label))) {
      hidden += rows.length
      continue
    }
    if (!open) continue
    for (const row of ordered) {
      if (!place({ kind: 'row', key: row.key, row }, cost(row.key, row.title, row.tags))) hidden++
    }
  }
  return { items, hidden }
}
