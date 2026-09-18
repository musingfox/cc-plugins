import { expect, test } from 'claude-code/testing'
import { bounded } from '../hooks/bounds.ts'
test('bounds text', () => { expect(bounded('a\r\nb')).toEqual({ text: 'a\nb', clippedFrom: null }); expect(bounded('x'.repeat(11000)).text).toHaveLength(10000) })
