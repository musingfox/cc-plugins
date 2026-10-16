import { describe, expect, test } from 'claude-code/testing'
import { drawable, oneLine } from '../hooks/text.ts'

describe('oneLine', () => {
  test('joins line breaks and tabs into single spaces', () => {
    expect(oneLine('a\nb')).toBe('a b')
    expect(oneLine('Room 1\n\n  2F\tNorth')).toBe('Room 1 2F North')
    expect(oneLine('a\r\nb')).toBe('a b')
  })

  test('drops control characters and trims the ends', () => {
    expect(oneLine('\n\u0007\n')).toBe('')
    expect(oneLine('  Lunch ')).toBe('Lunch')
    expect(oneLine('Plain  title')).toBe('Plain  title')
  })

  test('cuts at 1000 characters and ends with an ellipsis', () => {
    const cut = oneLine('x'.repeat(11000))
    expect(cut).toHaveLength(1000)
    expect(cut.endsWith('…')).toBe(true)
  })

  test('a cut never leaves a lone high surrogate before the ellipsis', () => {
    const cut = oneLine('😀'.repeat(6000))
    const body = cut.slice(0, -1)
    const last = body.charCodeAt(body.length - 1)
    expect(cut).toHaveLength(999)
    expect(cut.endsWith('…')).toBe(true)
    expect(last < 0xd800 || last > 0xdbff).toBe(true)
  })
})

describe('drawable', () => {
  test('removes control characters other than tab and newline', () => {
    expect(drawable('a\u001b[31mb\u0000c')).toBe('a[31mbc')
    expect(drawable('a\tb\nc\u0001')).toBe('a\tb\nc')
  })

  test('cuts at the limit and ends with an ellipsis', () => {
    const cut = drawable('x'.repeat(20000))
    expect(cut).toHaveLength(10000)
    expect(cut.endsWith('…')).toBe(true)
  })

  test('a cut never leaves a lone high surrogate before the ellipsis', () => {
    const cut = drawable('😀'.repeat(6000))
    const body = cut.slice(0, -1)
    const last = body.charCodeAt(body.length - 1)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(10000)
    expect(last < 0xd800 || last > 0xdbff).toBe(true)
  })

  test('text at the limit is unchanged', () => {
    const exact = 'x'.repeat(10000)
    expect(drawable(exact)).toBe(exact)
  })
})
