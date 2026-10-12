import { describe, expect, test } from 'claude-code/testing'
import { appendNote, tickAc } from '../hooks/pm-tools.ts'
import { acLabel } from '../hooks/card.ts'

const TWO = '---\ntitle: t\nstatus: todo\n---\n# t\n\n## Acceptance Criteria\n- [ ] one\n- [ ] 二\n'
const MIXED = '---\ntitle: m\nstatus: todo\npriority: medium\n- [ ] fm\n---\n# t\n- [ ] not ac\n\n## Acceptance Criteria\n- [ ] one\n- [x] 二\n  - [ ] nested\n### three\n- [ ] three\n\n## Agent\n- [ ] outside\n'

test('ticks one box and leaves every other byte', () => {
  const out = tickAc(MIXED, 1, true)
  expect(out).toEqual({ text: MIXED.replace('- [ ] one', '- [x] one') })
})
test('unticks a CJK box', () => expect(tickAc(MIXED, 2, false)).toEqual({ text: MIXED.replace('- [x] 二', '- [ ] 二') }))
test('ticks an indented box and one under a ### subheading', () => {
  expect(tickAc(MIXED, 3, true)).toEqual({ text: MIXED.replace('  - [ ] nested', '  - [x] nested') })
  expect(tickAc(MIXED, 4, true)).toEqual({ text: MIXED.replace('- [ ] three', '- [x] three') })
})
test('refuses an index past the section, never counting boxes before or after it', () => expect(tickAc(MIXED, 5, true)).toHaveProperty('refused'))
test('refuses index 0, -1, 1.5 and NaN', () => {
  for (const index of [0, -1, 1.5, Number.NaN]) expect(tickAc(MIXED, index, true)).toHaveProperty('refused')
})
test('an already unchecked box is unchanged', () => expect(tickAc(MIXED, 1, false)).toEqual({ text: MIXED }))
test('ticks the section box, not a frontmatter line', () => {
  const out = tickAc(MIXED, 1, true)
  expect(out).toEqual({ text: MIXED.replace('- [ ] one', '- [x] one') })
  expect(MIXED.split('\n')[4]).toBe('- [ ] fm')
  expect((out as { text: string }).text.split('\n')[4]).toBe('- [ ] fm')
})
test('refuses a card with no acceptance-criteria heading', () => expect(tickAc('# t\n- [ ] a\n', 1, true)).toHaveProperty('refused'))
test('accepts a lowercase acceptance-criteria heading as acLabel does', () => {
  const lower = '## acceptance criteria\n- [ ] a\n'
  expect(tickAc(lower, 1, true)).toEqual({ text: '## acceptance criteria\n- [x] a\n' })
  expect(acLabel(lower)).toBe('AC 0/1')
})
test('the acLabel total is the largest index tickAc accepts', () => {
  const body = MIXED.slice(MIXED.indexOf('# t'))
  expect(acLabel(body)).toBe('AC 1/4')
  expect(tickAc(MIXED, 4, true)).toHaveProperty('text')
  expect(tickAc(MIXED, 5, true)).toHaveProperty('refused')
})

describe('appendNote', () => {
  test('adds a bullet and a Notes heading to a card without one', () => {
    expect(appendNote(TWO, '完成 API 重構')).toEqual({ text: `${TWO}\n## Notes\n- 完成 API 重構\n` })
  })
  test('adds the bullet after the last note', () => expect(appendNote('## Notes\n- a\n- b\n', 'c')).toEqual({ text: '## Notes\n- a\n- b\n- c\n' }))
  test('adds the bullet before the next section, keeping the blank line', () =>
    expect(appendNote('## Notes\n- a\n\n## Other\nx\n', 'b')).toEqual({ text: '## Notes\n- a\n- b\n\n## Other\nx\n' }))
  test('adds no final newline when the card has none', () => expect(appendNote('## Notes\n- a', 'b')).toEqual({ text: '## Notes\n- a\n- b' }))
  test('creates the section after a list and after a heading with no final newline', () => {
    expect(appendNote('# t\n- [ ] one\n', 'n')).toEqual({ text: '# t\n- [ ] one\n\n## Notes\n- n\n' })
    expect(appendNote('# t', 'n')).toEqual({ text: '# t\n\n## Notes\n- n\n' })
  })
  test('does not treat a ### Notes heading as the section', () => expect(appendNote('### Notes\nx\n', 'n')).toEqual({ text: '### Notes\nx\n\n## Notes\n- n\n' }))
  test('refuses empty, whitespace, newline, CR, tab, NUL and DEL lines', () => {
    for (const line of ['', '   ', 'a\nb', 'a\rb', 'a\tb', 'a\u0000b', 'a\u007fb']) expect(appendNote(TWO, line)).toHaveProperty('refused')
  })
})
