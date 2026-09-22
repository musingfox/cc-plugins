import type { ClientSurface } from 'claude-code'
import { RED } from './style.ts'
import { displayWidth, fitWidth } from './width.ts'
import type { BoardGroup as Group, BoardRow } from './list.ts'

export type Card =
  | { kind: 'loading'; name: string }
  | { kind: 'error'; message: string }
  | { kind: 'shown'; path: string; title: string; status: string; priority: string; ac: string | null; clip: string | null; body: string }
type Props = { rows: number; columns: number; groups: Group[]; hidden: number; card: Card | null }
type State = { cursor: number; top: number; collapsed: string[]; scroll: number; scrollPath: string | null }
type Item = { kind: 'heading'; group: Group; key: string; open: boolean } | { kind: 'row'; row: BoardRow }

const MISSING = '—'
const TAGS_MAX = 24
const START: State = { cursor: 0, top: 0, collapsed: ['done'], scroll: 0, scrollPath: null }

// The first line drawn: the stored one, moved just enough to keep the cursor in the window.
const topFor = (cursor: number, top: number, window: number) => Math.min(Math.max(top, cursor - window + 1), cursor)

// A fold is kept under its heading's key. A bounded status never holds \0, so neither the missing-status
// group nor a status that reads the same as an earlier one once capped shares a key with another group.
function keysOf(groups: Group[]) {
  const seen = new Map<string | null, number>()
  return groups.map((group) => {
    const repeat = seen.get(group.status) ?? 0
    seen.set(group.status, repeat + 1)
    return (group.status ?? '\0') + '\0'.repeat(repeat)
  })
}

function itemsOf(groups: Group[], collapsed: string[]) {
  const items: Item[] = []
  const keys = keysOf(groups)
  for (const [index, group] of groups.entries()) {
    const key = keys[index]
    const open = !collapsed.includes(key)
    items.push({ kind: 'heading', group, key, open })
    if (open) for (const row of group.rows) items.push({ kind: 'row', row })
  }
  return items
}

function rowLine(columns: number, groups: Group[]) {
  const rows = groups.flatMap((group) => group.rows)
  const dueW = Math.max(0, ...rows.map((row) => displayWidth(row.due)))
  const tagsW = Math.min(Math.max(0, ...rows.map((row) => displayWidth(row.tags))), TAGS_MAX)
  const titleW = Math.max(10, columns - 6 - (dueW ? dueW + 2 : 0) - (tagsW ? tagsW + 2 : 0))
  return (row: BoardRow) =>
    (
      `  [${row.badge}] ${fitWidth(row.title, titleW)}` +
      (dueW ? `  ${fitWidth(row.due, dueW)}` : '') +
      (tagsW ? `  ${fitWidth(row.tags, tagsW)}` : '')
    ).trimEnd()
}

// The body's lines, each hard-wrapped at `columns` cells; an empty body has none.
function wrapped(body: string, columns: number) {
  if (body === '') return []
  return body.split('\n').flatMap((text) => {
    const lines = ['']
    let used = 0
    for (const char of text) {
      const width = displayWidth(char)
      if (used + width > columns && used > 0) {
        lines.push('')
        used = 0
      }
      lines[lines.length - 1] += char
      used += width
    }
    return lines
  })
}

export default function Board(props: Props, surface: ClientSurface<State>) {
  const { Box, Text } = surface.elements
  const st = surface.state ?? START
  const column = (children: any[]) => Box({ flexDirection: 'column', children })

  if (props.card) {
    const card = props.card
    const toList = ({ key }: { key: string }) => {
      if (key === 'left') surface.post({ back: true })
    }
    if (card.kind !== 'shown') surface.onKey(toList)
    const back = Text({ dimColor: true, children: ['← list'] })
    if (card.kind === 'loading') return column([back, Text({ dimColor: true, children: [`Reading ${card.name}…`] })])
    if (card.kind === 'error') return column([back, Text({ color: RED, children: [card.message] })])
    // One line each, so the body window below them is exactly what the counter says.
    const fitted = (text: string) => fitWidth(text, props.columns).trimEnd()
    const header = [
      Text({ bold: true, children: [fitted(card.title)] }),
      Text({ children: [fitted([card.status, card.priority, ...(card.ac ? [card.ac] : [])].join(' · '))] }),
      ...(card.clip ? [Text({ dimColor: true, children: [fitted(card.clip)] })] : []),
    ]
    const lines = wrapped(card.body, props.columns)
    const window = Math.max(1, props.rows - 1 - header.length)
    const last = Math.max(0, lines.length - window)
    const scroll = st.scrollPath === card.path ? Math.min(st.scroll, last) : 0
    const scrollTo = (to: number) => surface.setState({ ...st, scroll: Math.min(Math.max(to, 0), last), scrollPath: card.path })
    surface.onKey(({ key }) => {
      if (key === 'down') scrollTo(scroll + 1)
      else if (key === 'up') scrollTo(scroll - 1)
      else if (key === 'pagedown') scrollTo(scroll + window)
      else if (key === 'pageup') scrollTo(scroll - window)
      else toList({ key })
    })
    return column([
      Text({ dimColor: true, children: [`↑↓ scroll  ← list  ${lines.length ? scroll + 1 : 0}/${lines.length}`] }),
      ...header,
      ...lines.slice(scroll, scroll + window).map((text) => Text({ children: [text] })),
    ])
  }

  const items = itemsOf(props.groups, st.collapsed)
  if (items.length === 0) {
    surface.onKey(() => {})
    return column([Text({ dimColor: true, children: ['No cards.'] })])
  }

  const window = Math.max(1, props.rows - 1 - (props.hidden > 0 ? 1 : 0))
  const cursor = Math.min(st.cursor, items.length - 1)
  const top = topFor(cursor, st.top, window)
  const move = (to: number) => {
    const next = Math.min(Math.max(to, 0), items.length - 1)
    surface.setState({ ...st, cursor: next, top: topFor(next, top, window) })
  }
  const fold = (collapsed: string[]) => surface.setState({ ...st, cursor, top, collapsed })
  surface.onKey(({ key }) => {
    const item = items[cursor]
    if (key === 'down') move(cursor + 1)
    else if (key === 'up') move(cursor - 1)
    else if (key === 'pagedown') move(cursor + window)
    else if (key === 'pageup') move(cursor - window)
    else if (item.kind === 'row') {
      if (key === 'left') move(items.findLastIndex((it, i) => i < cursor && it.kind === 'heading'))
      else if (key === 'right' || key === 'return') surface.post({ open: item.row.path })
    } else if ((key === 'right' || key === 'return') && !item.open) fold(st.collapsed.filter((key) => key !== item.key))
    else if (key === 'left' && item.open) fold([...st.collapsed, item.key])
  })

  const line = rowLine(props.columns, props.groups)
  const drawn = items.slice(top, top + window).map((item, i) =>
    Text({
      ...(top + i === cursor ? { inverse: true } : {}),
      wrap: 'truncate-end',
      children: [item.kind === 'heading' ? `${item.open ? '▾' : '▸'} ${item.group.status ?? MISSING}  ${item.group.count}` : line(item.row)],
    }),
  )
  return column([
    Text({ dimColor: true, children: [`↑↓ move  → open  ← back  PgUp/PgDn page  ${cursor + 1}/${items.length}`] }),
    ...drawn,
    ...(props.hidden > 0 ? [Text({ dimColor: true, children: [`${props.hidden} more not shown`] })] : []),
  ])
}
