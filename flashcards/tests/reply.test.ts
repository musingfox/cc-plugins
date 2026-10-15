import { describe, expect, test } from 'claude-code/testing'
import { parseReply } from '../hooks/reply.ts'

describe('parseReply', () => {
  test('a bare array of objects is its elements', () => {
    expect(parseReply('[{"source":"a","q":"x"}]')).toHaveLength(1)
  })

  test('the array is found amid a warning and a closing remark', () => {
    expect(parseReply('Warning: review raised a concern [see log]\n[{"source":"a"}]\nWrote 1 card.')).toEqual([{ source: 'a' }])
  })

  test('a code fence around the array is ignored', () => {
    expect(parseReply('```json\n[{"source":"a"}]\n```')).toEqual([{ source: 'a' }])
  })

  test('no array, an array of non-objects, or an empty array', () => {
    expect(parseReply('no cards today')).toBeNull()
    expect(parseReply('[1,2]')).toBeNull()
    expect(parseReply('[]')).toEqual([])
  })

  test('a closing bracket inside a string does not end the array', () => {
    expect(parseReply('[{"source":"a","q":"x ] y"}]')).toEqual([{ source: 'a', q: 'x ] y' }])
  })
})
