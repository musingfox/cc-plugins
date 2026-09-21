// RED, ORANGE and GREEN are omp-quota's values; a module imports only its own plugin's files.
export const RED = '#e5484d'
const ORANGE = '#f5a524'
const GREEN = '#46a758'
const GREY = '#8b8d98'
const BLUE = '#0090ff'

const STATUS = new Map([
  ['todo', GREY],
  ['in-progress', BLUE],
  ['blocked', RED],
  ['done', GREEN],
])
const PRIORITY = new Map([
  ['high', RED],
  ['medium', ORANGE],
  ['low', GREY],
])

export const STATUS_ORDER = [...STATUS.keys()]
export const PRIORITY_ORDER = [...PRIORITY.keys()]

export function statusColor(status: string | undefined): string | undefined {
  return status === undefined ? undefined : STATUS.get(status)
}

export function priorityColor(priority: string | undefined): string | undefined {
  return priority === undefined ? undefined : PRIORITY.get(priority)
}
