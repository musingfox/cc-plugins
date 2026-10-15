import { describe, expect, test } from 'claude-code/testing'
import { drawable } from '../hooks/text.ts'

describe('drawable', () => {
  test('removes control characters other than tab and newline', () => {
    expect(drawable('a\u001b[31mb\u0000c')).toBe('a[31mbc')
    expect(drawable('a\tb\nc')).toBe('a\tb\nc')
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
