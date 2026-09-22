import { expect, test } from 'claude-code/testing'
import { displayWidth, fitWidth } from '../hooks/width.ts'

test('counts CJK and emoji as two cells', () => {
  expect(['中文', '—', '…', '▾', '😀', 'ab', 'ｱ'].map(displayWidth)).toEqual([4, 1, 1, 1, 2, 2, 1])
})

test('clips wide text with an ellipsis and pads to the width', () => {
  expect(fitWidth('中文標題很長的標題文字', 14)).toBe('中文標題很長… ')
})

test('pads short text and clips long text', () => {
  expect([fitWidth('abc', 5), fitWidth('abcdef', 4), fitWidth('中中中', 3), fitWidth('中中', 3)]).toEqual(['abc  ', 'abc…', '中…', '中…'])
})

test('fits nothing into zero cells', () => expect(fitWidth('x', 0)).toBe(''))
