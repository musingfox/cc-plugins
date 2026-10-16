import { describe, expect, test } from 'claude-code/testing'
import { drawable, oneLine } from '../hooks/text.ts'

describe('oneLine', () => {
  test('joins a newline with a space', () => {
    expect(oneLine('a\nb')).toBe('a b')
  })

  test('collapses newlines, tabs and surrounding spaces into one space', () => {
    expect(oneLine('Room 1\n\n  2F\tNorth')).toBe('Room 1 2F North')
  })

  test('treats a CRLF pair as one line break', () => {
    expect(oneLine('a\r\nb')).toBe('a b')
  })

  test('removes other control characters and returns empty for control-only input', () => {
    expect(oneLine('\n\u0007\n')).toBe('')
  })

  test('leaves ordinary spacing inside a line alone', () => {
    expect(oneLine('Plain  title')).toBe('Plain  title')
  })

  test('clips to 1000 characters and ends with an ellipsis', () => {
    const cut = oneLine('x'.repeat(11000))
    expect(cut).toHaveLength(1000)
    expect(cut.endsWith('…')).toBe(true)
  })

  test('a clipped emoji string never leaves a lone high surrogate before the ellipsis', () => {
    const cut = oneLine('😀'.repeat(6000))
    expect(cut).toHaveLength(999)
    const last = cut.charCodeAt(cut.length - 2)
    expect(last >= 0xdc00 && last <= 0xdfff).toBe(true)
    expect(cut.endsWith('…')).toBe(true)
  })
})

describe('drawable', () => {
  test('keeps tab and newline, drops other control characters, and clips at 10000', () => {
    expect(drawable('a\tb\nc\u0001')).toBe('a\tb\nc')
    const cut = drawable('x'.repeat(20000))
    expect(cut).toHaveLength(10000)
    expect(cut.endsWith('…')).toBe(true)
  })
})
