import { expect, test } from 'claude-code/testing'
import { bounded } from '../hooks/bounds.ts'
test('normalizes CRLF', () => expect(bounded('a\r\nb')).toEqual({ text: 'a\nb', clippedFrom: null }))
test('removes C0 and C1 controls except tab', () => expect(bounded('a\u001bb\tc\u0085')).toEqual({ text: 'ab\tc', clippedFrom: null }))
test('clips long text', () => expect(bounded('x'.repeat(11000))).toEqual({ text: 'x'.repeat(10000), clippedFrom: 11000 }))
test('leaves boundary text', () => expect(bounded('x'.repeat(10000))).toEqual({ text: 'x'.repeat(10000), clippedFrom: null }))
test('does not split a surrogate pair', () => expect(bounded('a' + '😀'.repeat(5000))).toEqual({ text: 'a' + '😀'.repeat(4999), clippedFrom: 10001 }))
test('leaves short Unicode text', () => expect(bounded('短い')).toEqual({ text: '短い', clippedFrom: null }))
