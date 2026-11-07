import { expect, test } from 'claude-code/testing'
import { GLYPH, STATE_COLOR, bar, costText, progressCell } from '../band-model.ts'

test('RowCells T1 each state has its glyph', () => {
  const order = ['starting', 'running', 'question', 'idle', 'done', 'blocked', 'malformed', 'exited'] as const
  expect(order.map((state) => GLYPH[state])).toEqual(['…', '●', '?', '○', '√', '×', '◊', '■'])
})

test('RowCells T2 each state has its theme color', () => {
  const order = ['starting', 'running', 'question', 'idle', 'done', 'blocked', 'malformed', 'exited'] as const
  expect(order.map((state) => STATE_COLOR[state])).toEqual(['inactive', 'suggestion', 'warning', 'permission', 'success', 'error', 'error', 'inactive'])
})

test('RowCells T3 progress shows the plan when there is one and the tool count otherwise', () => {
  expect(progressCell({ plan: { done: 2, total: 5 }, tools: 9 })).toEqual({ text: '██░░░ 2/5', dim: false })
  expect(progressCell({ plan: null, tools: 9 })).toEqual({ text: '# 9', dim: true })
  expect(progressCell({ plan: null, tools: 0 }).text).toBe('# 0')
})

test('RowCells T5 the bar fills round(done/total*5) of five cells, then the count', () => {
  expect(bar(0, 4)).toBe('░░░░░ 0/4')
  expect(bar(1, 3)).toBe('██░░░ 1/3')
  expect(bar(1, 10)).toBe('█░░░░ 1/10')
  expect(bar(7, 7)).toBe('█████ 7/7')
})

test('RowCells T4 cost is two spaces, a dollar sign and one decimal, or empty when unknown', () => {
  expect(costText(5.7291)).toBe('  $5.7')
  expect(costText(0)).toBe('  $0.0')
  expect(costText(null)).toBe('')
})

test('RowCells R1 a cost of 1e21 or more still shows plain digits and one decimal', () => {
  expect(costText(1e21)).toMatch(/^  \$[0-9]+\.0$/)
  expect(costText(1e300)).toMatch(/^  \$[0-9]+\.0$/)
})
