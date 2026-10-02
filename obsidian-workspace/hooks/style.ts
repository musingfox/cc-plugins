// Claude Code theme keys, so the pane follows the person's /theme; no raw colour appears anywhere in it.
export const ERROR = 'error'
export const INACTIVE = 'inactive'
export const SUBTLE = 'subtle'
export const RULE = 'promptBorder'
export const ACCENT = 'claude'

const STATUS = new Map([
  ['todo', 'text'],
  ['in-progress', 'permission'],
  ['blocked', ERROR],
  ['done', 'success'],
])
const PRIORITY = new Map([
  ['high', ERROR],
  ['medium', 'warning'],
  ['low', INACTIVE],
])

export const STATUS_ORDER = [...STATUS.keys()]
export const PRIORITY_ORDER = [...PRIORITY.keys()]

export function statusColor(status: string | undefined): string | undefined {
  return status === undefined ? undefined : STATUS.get(status)
}

export function priorityColor(priority: string | undefined): string | undefined {
  return priority === undefined ? undefined : PRIORITY.get(priority)
}
