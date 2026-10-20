import { expect, test } from 'claude-code/testing'
import { elapsedSeconds, elapsedText } from '../band-model.ts'

test('ElapsedText T1 seconds, minutes and hours read as the band spells them', () => {
  const cases: [number, string][] = [
    [0, '0s'],
    [59, '59s'],
    [60, '1m'],
    [89, '1m'],
    [90, '2m'],
    [3540, '59m'],
    [3599, '1h0m'],
    [3600, '1h0m'],
    [5430, '1h31m'],
    [7260, '2h1m'],
  ]
  for (const [seconds, text] of cases) expect(elapsedText(seconds)).toBe(text)
})

test('ElapsedText T2 a running run counts from its start to now', () => {
  expect(elapsedSeconds('2026-10-20T10:00:00Z', null, Date.parse('2026-10-20T10:02:05Z'))).toBe(125)
})

test('ElapsedText T3 a finished run counts to its end and a start after now is never negative', () => {
  expect(elapsedSeconds('2026-10-20T10:00:00Z', '2026-10-20T10:01:00Z', Date.parse('2026-10-20T10:30:00Z'))).toBe(60)
  expect(elapsedSeconds('2026-10-20T10:00:00Z', null, Date.parse('2026-09-01T00:00:00Z'))).toBe(0)
})

test('ElapsedText T4 a start that does not parse gives null', () => {
  expect(elapsedSeconds('nope', null, Date.parse('2026-10-20T10:00:00Z'))).toBeNull()
})
