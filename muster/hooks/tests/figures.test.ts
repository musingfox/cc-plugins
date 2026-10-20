import { expect, test } from 'claude-code/testing'
import { figuresOf } from '../band-model.ts'

test('PhaseFigures T1 the writer figures come through as written', () => {
  expect(figuresOf({ title: 'T', plan: { done: 2, total: 5 }, tools: 7, cost: 1.25 })).toEqual({ title: 'T', plan: { done: 2, total: 5 }, tools: 7, cost: 1.25 })
})

test('PhaseFigures T2 a phase with no figures gets the fallbacks', () => {
  const fallback = { title: '(no title yet)', plan: null, tools: 0, cost: null }
  expect(figuresOf({})).toEqual(fallback)
  expect(figuresOf(null)).toEqual(fallback)
})

test('PhaseFigures T3 a plan that is not two counts with a positive total is no plan', () => {
  for (const plan of [{ done: 'x', total: 3 }, { done: 1, total: 0 }, { done: -1, total: 3 }]) expect(figuresOf({ plan }).plan).toBeNull()
})

test('PhaseFigures T4 a done count above the total is capped at the total', () => {
  expect(figuresOf({ plan: { done: 7, total: 5 } }).plan).toEqual({ done: 5, total: 5 })
})

test('PhaseFigures T5 tools, cost and title that are not valid fall back', () => {
  for (const tools of [-1, 3.7, '4']) expect(figuresOf({ tools }).tools).toBe(0)
  for (const cost of ['1', NaN]) expect(figuresOf({ cost }).cost).toBeNull()
  expect(figuresOf({ title: '   ' }).title).toBe('(no title yet)')
})
