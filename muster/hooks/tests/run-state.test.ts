import { expect, test } from 'claude-code/testing'
import { classifyRun } from '../band-model.ts'

test('RunStateRules T1 an unanswered question shows the run as waiting', () => {
  expect(classifyRun({ phase: 'running', files: ['QUESTION-1.json'] })).toBe('question')
})

test('RunStateRules T2 an answered question shows the run as working again', () => {
  expect(classifyRun({ phase: 'running', files: ['QUESTION-1.json', 'ANSWER-1.json'] })).toBe('running')
})

test('RunStateRules T3 any unanswered question keeps the run waiting', () => {
  expect(classifyRun({ phase: 'running', files: ['QUESTION-2.json', 'ANSWER-1.json'] })).toBe('question')
})

test('RunStateRules T4 an exited run with a blocked report is blocked, not waiting', () => {
  expect(classifyRun({ phase: 'exited', files: ['QUESTION-1.json'], report: 'BLOCKED' })).toBe('blocked')
})

test('RunStateRules T5 a question beats a done report', () => {
  expect(classifyRun({ phase: 'running', files: ['QUESTION-1.json'], report: 'DONE' })).toBe('question')
})

test('RunStateRules T6 the report decides a finished run and a malformed one is named as such', () => {
  expect(classifyRun({ phase: 'idle', report: 'DONE' })).toBe('done')
  expect(classifyRun({ phase: 'idle', report: 'BLOCKED' })).toBe('blocked')
  expect(classifyRun({ phase: 'idle', report: 'done' })).toBe('malformed')
  expect(classifyRun({ phase: 'idle', report: '' })).toBe('malformed')
})

test('RunStateRules T7 without a report the phase decides', () => {
  expect(classifyRun({ phase: 'question', files: [] })).toBe('running')
  expect(classifyRun({ phase: 'starting', files: [] })).toBe('starting')
  expect(classifyRun({ phase: 'idle', files: [] })).toBe('idle')
  expect(classifyRun({ phase: 'exited', files: [] })).toBe('exited')
  expect(classifyRun({ phase: 'bogus', files: [] })).toBe('exited')
  expect(classifyRun({ phase: undefined, files: [] })).toBe('exited')
})

test('RunStateRules T8 a temporary file named like a question is not a question', () => {
  expect(classifyRun({ phase: 'running', files: ['QUESTION-1.json.123.abc.tmp'] })).toBe('running')
})

test('RunStateRules T9 a done report with no other facts is done', () => {
  expect(classifyRun({ phase: 'running', report: 'DONE' })).toBe('done')
})
