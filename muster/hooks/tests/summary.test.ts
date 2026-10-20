import { expect, test } from 'claude-code/testing'
import { summaryParts } from '../band-model.ts'

test('BandSummary T1 the header counts each state that is present', () => {
  const rows = [{ state: 'running' }, { state: 'starting' }, { state: 'question' }, { state: 'idle' }, { state: 'idle' }] as const
  expect(summaryParts([...rows], 2)).toEqual(['2 running', '1 question', '2 idle', '2 to collect'])
})

test('BandSummary T2 a count of zero is left out', () => {
  expect(summaryParts([{ state: 'question' }], 0)).toEqual(['1 question'])
})

test('BandSummary T3 starting counts as running', () => {
  expect(summaryParts([{ state: 'starting' }], 3)).toEqual(['1 running', '3 to collect'])
})
