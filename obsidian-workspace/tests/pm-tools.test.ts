import { expect, test } from 'claude-code/testing'
import { tickAc } from '../hooks/pm-tools.ts'
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
