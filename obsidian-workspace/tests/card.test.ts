import { describe, expect, test } from 'claude-code/testing'
import { acLabel, headerOf, relationsOf } from '../hooks/card.ts'
const CARD = 'title: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\ndue:'
test('reads complete card headers', () => expect(headerOf(CARD)).toEqual({ title: 'Claude Mod：面板顯示 obw 的 task 與 issue', status: 'todo', priority: 'medium' }))
test('reads a quoted title', () => expect(headerOf("title: 'x'")).toEqual({ title: 'x' }))
test('retains absent header fields', () => expect(headerOf('status: todo')).toEqual({ title: undefined, status: 'todo', priority: undefined }))
test('ignores nested title', () => expect(headerOf('  title: nested').title).toBe(undefined))
test('keeps hashes in a title', () => expect(headerOf('title: Fix #12 now')).toEqual({ title: 'Fix #12 now' }))
test('omits empty title', () => expect(headerOf('title:').title).toBe(undefined))
test('keeps a title holding a carriage return', () => expect(headerOf(`title: "a${String.fromCharCode(13)}b"`).title).toBe(`a${String.fromCharCode(13)}b`))

const acCases: [string, string | null][] = [
  ['## Acceptance Criteria\n- [x] a\n- [ ] b\n- [X] c\n', 'AC 2/3'],
  ['# m\n\n## Acceptance Criteria\n- [ ] one\n', 'AC 0/1'],
  ['## Acceptance Criteria\n- [ ] a\n## Notes\n- [x] n\n', 'AC 0/1'],
  ['## Acceptance Criteria\n- [ ] a\n# Next\n- [x] n\n', 'AC 0/1'],
  ['## Acceptance Criteria\n### Sub\n- [x] a\n', 'AC 1/1'],
  ['## Acceptance Criteria\n* [x] a\n+ [ ] b\n  - [x] nested\n- [x]\n', 'AC 3/4'],
  ['## acceptance criteria  \n- [x] a\n', 'AC 1/1'],
  ['- [x] outside\n## Acceptance Criteria\nnone\n', null],
  ['body\n', null],
  ['- [x] a\n', null],
  ['## Acceptance Criteria\n- [x]a\n- [ ]\n', 'AC 0/1'],
]
for (const [body, label] of acCases) test(`counts ${JSON.stringify(body)} as ${label}`, () => expect(acLabel(body)).toBe(label))

describe('relationsOf', () => {
  const none = { parent: [], blocked_by: [], related: [] }
  const cases: [string, string, object][] = [
    ['a quoted parent', 'parent: "[[mod-obw-issue-pane]]"', { ...none, parent: ['mod-obw-issue-pane'] }],
    ['an empty parent', 'parent:', none],
    ['an inline empty list', 'blocked_by: []', none],
    ['an indented block list', 'blocked_by:\n  - "[[a]]"\n  - "[[b]]"\ntags:\n  - x', { ...none, blocked_by: ['a', 'b'] }],
    ['an unindented block list', 'blocked_by:\n- "[[a]]"', { ...none, blocked_by: ['a'] }],
    ['an inline list with an alias', 'related: ["[[a]]", "[[b|B]]"]', { ...none, related: ['a', 'b'] }],
    ['a heading link and its duplicate', 'related:\n  - "[[x#h]]"\n  - "[[x]]"', { ...none, related: ['x'] }],
    ['no relation field', 'title: t\nstatus: todo', none],
  ]
  for (const [name, frontmatter, expected] of cases) test(`reads ${name}`, () => expect(relationsOf(frontmatter)).toEqual(expected))
})
