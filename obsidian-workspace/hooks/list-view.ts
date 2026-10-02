import { bounded } from './bounds.ts'
import { listItems } from './list.ts'
import { QUERY_KEY } from './ring.ts'
import type { BoardGroup, Item } from './list.ts'
import { ACCENT, INACTIVE, RULE, SUBTLE, priorityColor, statusColor } from './style.ts'
import { displayWidth, fitWidth } from './width.ts'
import type { ObwList } from '../types/index.d.ts'

export type ListHandlers = {
  fold: (key: string) => void
  open: (path: string) => void
  focusQuery: () => void
  query: (text: string) => void
  submit: (text: string) => void
  priority: () => void
  sort: () => void
  clear: () => void
}

const TAGS_MAX = 26

const safe = (text: string) => bounded(text).text
const fitted = (text: string, width: number) => fitWidth(text, width).trimEnd()

const tint = (ui: any, color: string | undefined, text: string, more: Record<string, unknown> = {}) =>
  ui.Text({ ...(color ? { color } : {}), ...more, children: [safe(text)] })

export const isFiltered = (list: ObwList) => Boolean(list.query.trim() || list.priority)

function toolbar(ui: any, handlers: ListHandlers, surface: string, list: ObwList) {
  const button = (key: string, hotkey: string, label: string, onPress: () => void, more: Record<string, unknown> = {}) =>
    ui.Button({ plain: true, key, hotkey, label, ...more, onPress })
  return ui.Box({
    flexDirection: 'row',
    gap: 2,
    children: [
      // A phone has no text field to filter with.
      ...(surface === 'mobile'
        ? []
        : [
            ui.Box({
              flexDirection: 'row',
              children: [
                button('focus-query', 'f', 'filter', handlers.focusQuery),
                tint(ui, ACCENT, ' › '),
                ui.Input({ key: QUERY_KEY, placeholder: 'tag or title', value: safe(list.query), onInput: handlers.query, onSubmit: handlers.submit }),
              ],
            }),
          ]),
      button('priority', 'p', `priority ${list.priority ?? 'all'}`, handlers.priority, list.priority ? {} : { dimColor: true }),
      button('sort', 's', `sort ${list.sort}`, handlers.sort, { dimColor: true }),
      ...(isFiltered(list) ? [button('clear', 'x', 'clear', handlers.clear)] : []),
    ],
  })
}

function heading(ui: any, handlers: ListHandlers, item: Extract<Item, { kind: 'heading' }>, isFirst: boolean) {
  return ui.Box({
    flexDirection: 'row',
    marginTop: 1,
    children: [
      tint(ui, INACTIVE, item.open ? '▾ ' : '▸ '),
      tint(ui, item.status === null ? undefined : statusColor(item.status), '● '),
      ui.Button({ plain: true, key: item.key, label: safe(item.label || 'no status'), ...(isFirst ? { autoFocus: true } : {}), onPress: () => handlers.fold(item.key) }),
      tint(ui, SUBTLE, `  ${item.count}`),
    ],
  })
}

function row(ui: any, handlers: ListHandlers, columns: number, { row }: Extract<Item, { kind: 'row' }>) {
  const tags = fitted(row.tags, TAGS_MAX)
  const titleWidth = Math.max(10, columns - 10 - (tags ? displayWidth(tags) + 2 : 0))
  const letter = row.badge === ' ' ? '-' : row.badge
  return ui.Box({
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: Math.max(0, columns - 2),
    children: [
      ui.Box({
        flexDirection: 'row',
        children: [
          ui.Text({ children: ['  '] }),
          ui.Text({ children: [tint(ui, SUBTLE, '['), tint(ui, priorityColor(row.priority ?? undefined), letter, { bold: true }), tint(ui, SUBTLE, ']')] }),
          ui.Text({ children: [' '] }),
          ui.Button({ plain: true, key: row.key, label: safe(fitted(row.title, titleWidth) || '—'), onPress: () => handlers.open(row.path) }),
        ],
      }),
      ...(tags ? [tint(ui, INACTIVE, tags, { wrap: 'truncate-end' })] : []),
    ],
  })
}

// The toolbar, the rule and the headings with their rows, under whatever the pane drew above.
export function listChildren(
  ui: any,
  args: { surface: string; columns: number; ruleWidth: number; allTasks: { groups: BoardGroup[]; hidden: number }; list: ObwList; handlers: ListHandlers },
) {
  const { surface, columns, ruleWidth, allTasks, list, handlers } = args
  const { items, hidden } = listItems(allTasks.groups, list)
  const children: any[] = [toolbar(ui, handlers, surface, list), tint(ui, RULE, '─'.repeat(ruleWidth))]
  if (!items.length) children.push(tint(ui, INACTIVE, '› no cards match'))
  items.forEach((item, index) => children.push(item.kind === 'heading' ? heading(ui, handlers, item, index === 0) : row(ui, handlers, columns, item)))
  const left = hidden + allTasks.hidden
  if (left > 0) children.push(ui.Text({ dimColor: true, children: [`${left} more not shown`] }))
  return children
}

export function listHints(ui: any, surface: string) {
  const parts = ['↑↓ move', 'enter open or fold', ...(surface === 'mobile' ? [] : ['f filter']), 'esc close']
  return ui.Box({ marginTop: 1, children: [tint(ui, SUBTLE, parts.join(' · '), { wrap: 'truncate-end' })] })
}
