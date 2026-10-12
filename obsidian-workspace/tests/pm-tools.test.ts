import { describe, expect, test } from 'claude-code/testing'
import { appendNote, cardText, evalArgv, setStatus, tickAc } from '../hooks/pm-tools.ts'
import { readOutput } from '../hooks/cli-output.ts'
import { acLabel } from '../hooks/card.ts'

const CARD = '---\ntitle: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\ndue:\ntags:\n  - claude-mods\ncreated: 2026-09-18\n---\n# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n'
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

describe('setStatus', () => {
  test('replaces only the frontmatter status line', () => expect(setStatus(MIXED, 'done')).toEqual({ text: MIXED.replace('status: todo', 'status: done') }))
  test('replaces quoted and unspaced status lines', () => {
    const quoted = '---\nstatus: "todo"\n---\n'
    const unspaced = '---\nstatus:todo\n---\n'
    expect(setStatus(quoted, 'in-progress')).toEqual({ text: '---\nstatus: in-progress\n---\n' })
    expect(setStatus(unspaced, 'in-progress')).toEqual({ text: '---\nstatus: in-progress\n---\n' })
  })
  test('refuses a status outside the four values', () => {
    for (const status of ['finished', '', 'Done', 'done\n', ' done']) expect(setStatus(MIXED, status)).toHaveProperty('refused')
  })
  test('ignores a status line in the body', () => expect(setStatus('---\ntitle: x\n---\nstatus: todo\n', 'done')).toHaveProperty('refused'))
  test('refuses a card with no frontmatter or only a nested status line', () => {
    expect(setStatus('# t\nstatus: todo\n', 'done')).toHaveProperty('refused')
    expect(setStatus('---\nx:\n  status: x\n---\n', 'done')).toHaveProperty('refused')
  })
})

describe('cardText', () => {
  test('rebuilds the whole card from its frontmatter and body', () => expect(cardText({ frontmatter: 'a: 1', body: '# x\n' })).toEqual({ text: '---\na: 1\n---\n# x\n' }))
  test('round-trips a read card byte-exactly', () => {
    for (const text of [CARD, TWO, MIXED]) {
      const card = readOutput({ kind: 'exited', exitCode: 0, stdout: text, stderr: '' })
      expect(card).toMatchObject({ kind: 'card' })
      expect(cardText(card as { frontmatter: string; body: string })).toEqual({ text })
    }
  })
  test('refuses an empty frontmatter', () => expect(cardText({ frontmatter: '', body: 'x' })).toHaveProperty('refused'))
})

const decode = (argv: string[]) => {
  const payload = /atob\('([^']*)'\)/.exec(argv[3])![1]
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))))
}
const SCOPE = { vault: 'obsidian', project: 'cc-plugins' }
const P = 'pm/cc-plugins/tasks/a.md'

describe('evalArgv', () => {
  test('builds one eval call carrying the text as base64 and never content=', () => {
    const built = evalArgv(SCOPE, P, TWO)
    expect(built).toHaveProperty('argv')
    const { argv } = built as { argv: string[] }
    expect(argv).toHaveLength(4)
    expect(argv.slice(0, 3)).toEqual(['obsidian', 'vault=obsidian', 'eval'])
    expect(argv[3].startsWith('code=')).toBe(true)
    expect(argv[3].split("atob('").length - 1).toBe(1)
    expect(argv[3]).toContain('app.vault.modify')
    expect(argv[3]).toContain("'OK'")
    expect(argv.some((element) => element.startsWith('content='))).toBe(false)
  })
  test('the base64 decodes to the path and the text, CJK intact', () => {
    const { argv } = evalArgv(SCOPE, P, TWO) as { argv: string[] }
    expect(decode(argv)).toEqual({ path: P, text: TWO })
  })
  test('keeps code-like and special characters out of the code, and round-trips them', () => {
    const text = "x'); app.vault.delete(f); //${1}$&`\nline \"q\""
    const { argv } = evalArgv(SCOPE, P, text) as { argv: string[] }
    for (const raw of ["x'); app.vault.delete(f); //", '${1}', '$&', '`', '\n', '"']) expect(argv[3]).not.toContain(raw)
    expect(decode(argv).text).toBe(text)
  })
  test('carries 60,000 CJK characters in one code element', () => {
    const text = '字'.repeat(60000)
    const { argv } = evalArgv(SCOPE, P, text) as { argv: string[] }
    expect(argv.filter((element) => element.startsWith('code='))).toHaveLength(1)
    expect(decode(argv).text).toBe(text)
  })
  test('refuses an empty, dot-only, foreign, nested or non-.md path with no argv', () => {
    for (const path of ['', 'pm/cc-plugins/tasks/.md', 'pm/other/tasks/a.md', 'pm/cc-plugins/tasks/a/b.md', 'pm/cc-plugins/tasks/..md']) {
      const built = evalArgv(SCOPE, path, TWO)
      expect(built).toHaveProperty('refused')
      expect(built).not.toHaveProperty('argv')
    }
  })
})

test('evalArgv refuses a bad vault or project', () => {
  for (const scope of [{ vault: '', project: 'cc-plugins' }, { vault: 'v', project: '' }]) {
    const built = evalArgv(scope, P, TWO)
    expect(built).toHaveProperty('refused')
    expect(built).not.toHaveProperty('argv')
  }
})
