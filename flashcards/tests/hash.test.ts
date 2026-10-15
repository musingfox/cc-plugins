import { describe, expect, test } from 'claude-code/testing'
import { hashText, reviewableText } from '../hooks/hash.ts'

describe('hashText', () => {
  test('hashes the UTF-8 text to 64 lowercase hex digits', async () => {
    expect(await hashText('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
})

describe('reviewableText', () => {
  const body = 'a\n'

  test('a task is cut at its Agent heading', () => {
    expect(reviewableText('task', 'a\n## Agent\nlog line')).toBe('a\n')
  })

  test('the log below the heading does not change the hash, the text above it does', async () => {
    const withLog = await hashText(reviewableText('task', `${body}## Agent\nmore log`))
    const plain = await hashText(reviewableText('task', body))
    const changed = await hashText(reviewableText('task', 'b\n## Agent\nmore log'))
    expect(withLog).toBe(plain)
    expect(changed).not.toBe(plain)
  })

  test('only the exact heading cuts', () => {
    expect(reviewableText('task', 'x\n### Agent notes\ny')).toBe('x\n### Agent notes\ny')
    expect(reviewableText('task', 'x\n## Agents\ny')).toBe('x\n## Agents\ny')
  })

  test('a spec is never cut', () => {
    expect(reviewableText('spec', 'x\n## Agent\ny')).toBe('x\n## Agent\ny')
  })
})
