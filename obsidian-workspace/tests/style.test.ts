import { describe, expect, test } from 'claude-code/testing'
import { priorityColor, statusColor } from '../hooks/style.ts'

describe('statusColor', () => {
  const cases: [string | undefined, string | undefined][] = [
    ['todo', '#8b8d98'],
    ['in-progress', '#0090ff'],
    ['blocked', '#e5484d'],
    ['done', '#46a758'],
    ['Done', undefined],
    ['wip', undefined],
    [undefined, undefined],
  ]
  for (const [status, color] of cases) test(`colours ${status} as ${color}`, () => expect(statusColor(status)).toBe(color))
})

describe('priorityColor', () => {
  const cases: [string | undefined, string | undefined][] = [
    ['high', '#e5484d'],
    ['medium', '#f5a524'],
    ['low', '#8b8d98'],
    ['urgent', undefined],
    [undefined, undefined],
  ]
  for (const [priority, color] of cases) test(`colours ${priority} as ${color}`, () => expect(priorityColor(priority)).toBe(color))
})
