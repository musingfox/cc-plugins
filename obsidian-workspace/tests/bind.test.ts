import { expect, test } from 'claude-code/testing'
import { bindingAction, bindingOf, bindingPath, statusChanges } from '../hooks/bind.ts'

const A = 'pm/cc-plugins/tasks/a.md'
const B = 'pm/cc-plugins/tasks/b.md'
const change = (value: 'in-progress' | 'done', target: any, vault: string | null = 'obsidian') => ({ value, vault, target })
const card = (cardPath: string) => ({ kind: 'bind', card: { cardPath, vault: 'obsidian', project: 'cc-plugins' } })
const bound = (cardPath: string, vault = 'obsidian') => ({ cardPath, vault })
const CFG = { vault: 'obsidian', project: 'cc-plugins' }
const SET_A_IN_PROGRESS = `obsidian vault=obsidian property:set name=status value=in-progress path=${A}`

test('P1 variables expand into the command', () => {
  const cmd = 'V=obsidian; P="pm/cc-plugins/tasks/mod-obw-bind-and-band.md"\ntimeout 20 obsidian vault=$V property:set name=status value=in-progress path="$P" | cat'
  expect(statusChanges(cmd, 'Set status: in-progress\n')).toEqual([change('in-progress', { path: 'pm/cc-plugins/tasks/mod-obw-bind-and-band.md' })])
})
test('P2 a loop variable stays unresolved', () => {
  const cmd = 'cd /tmp && V="vault=obsidian"; for n in a b; do p="pm/cc-plugins/tasks/$n.md"; obsidian $V property:set name=status value=done path="$p" | cat; done'
  expect(statusChanges(cmd, 'Set status: done\nSet completed: 2026-10-06\n')).toEqual([])
})
test('P3 a variable expands to a whole vault argument', () => {
  const cmd = 'V="vault=obsidian"; obsidian $V property:set name=status value=done path="pm/cc-plugins/tasks/a.md" | cat'
  expect(statusChanges(cmd, 'Set status: done\nSet completed: 2026-10-06\n')).toEqual([change('done', { path: A })])
})
test('P4 argument order is free', () => {
  expect(statusChanges(`obsidian vault=obsidian property:set path="${A}" name=status value=done`, 'Set status: done')).toEqual([change('done', { path: A })])
})
test('P5 quoted name and value, file target', () => {
  expect(statusChanges('obsidian vault=obsidian property:set name="status" value="in-progress" file=a', 'Set status: in-progress')).toEqual([change('in-progress', { file: 'a' })])
})
test('P6 only the confirmed status segment counts', () => {
  const cmd = `obsidian vault=obsidian property:set name=priority value=high path=${A} && ${SET_A_IN_PROGRESS}`
  expect(statusChanges(cmd, 'Set priority: high\nSet status: in-progress\n')).toEqual([change('in-progress', { path: A })])
})
test('P7 a substring of an error line does not confirm', () => {
  expect(statusChanges(SET_A_IN_PROGRESS, 'Error: could not Set status: in-progress')).toEqual([])
})
test('P8 a prefix or another value does not confirm', () => {
  expect(statusChanges(SET_A_IN_PROGRESS, 'Set status: in-progressx')).toEqual([])
  expect(statusChanges(SET_A_IN_PROGRESS, 'Set status: done')).toEqual([])
})
test('P9 another value yields nothing', () => {
  expect(statusChanges(`obsidian vault=obsidian property:set name=status value=blocked path=${A}`, 'Set status: blocked')).toEqual([])
})
test('P10 no vault gives null', () => {
  expect(statusChanges(`obsidian property:set name=status value=in-progress path=${A}`, 'Set status: in-progress')).toEqual([change('in-progress', { path: A }, null)])
})
test('P11 an unassigned variable yields nothing', () => {
  expect(statusChanges('obsidian vault=obsidian property:set name=status value=in-progress path="$CARD"', 'Set status: in-progress')).toEqual([])
})
test('P12 braced variables expand', () => {
  expect(statusChanges(`P=${A}; obsidian vault=obsidian property:set name=status value=done path=\${P}`, 'Set status: done')).toEqual([change('done', { path: A })])
})
test('S-R1 an env prefix before obsidian still counts', () => {
  expect(statusChanges(`FOO=1 ${SET_A_IN_PROGRESS}`, 'Set status: in-progress')).toEqual([change('in-progress', { path: A })])
})
test('S-R2 several assignments in one statement all expand', () => {
  expect(statusChanges(`V=obsidian P=${A}; obsidian vault=$V property:set name=status value=in-progress path=$P`, 'Set status: in-progress')).toEqual([change('in-progress', { path: A })])
})
test('S-R3 a dollar left in a non-winning file argument yields nothing', () => {
  expect(statusChanges(`${SET_A_IN_PROGRESS} file=$X`, 'Set status: in-progress')).toEqual([])
})
test('S-R4 a backtick substitution left in the path yields nothing', () => {
  expect(statusChanges('obsidian vault=obsidian property:set name=status value=in-progress path=pm/cc-plugins/tasks/`whoami`.md', 'Set status: in-progress')).toEqual([])
})
test('P13 an unrelated command yields nothing', () => {
  expect(statusChanges('ls -la', 'Set status: in-progress')).toEqual([])
})

test('D1 a path target binds', () => {
  expect(bindingAction([change('in-progress', { path: A })], null, null)).toEqual(card(A))
})
test('D2 a file target resolves through config', () => {
  expect(bindingAction([change('in-progress', { file: 'a' }, null)], CFG, null)).toEqual(card(A))
})
test('D3 a file target without config is skipped', () => {
  expect(bindingAction([change('in-progress', { file: 'a' })], null, null)).toBeNull()
})
test('D4 the project comes from the path', () => {
  expect(bindingAction([change('in-progress', { path: A }, null)], { vault: 'obsidian', project: 'other' }, null)).toEqual(card(A))
})
test('D5 bad card paths are skipped', () => {
  for (const path of ['pm/cc-plugins/docs/x.md', 'pm/cc-plugins/tasks/../x.md', 'notes/a.md'])
    expect(bindingAction([change('in-progress', { path })], null, null)).toBeNull()
})
test('D6 the last in-progress wins', () => {
  expect(bindingAction([change('in-progress', { path: A }), change('in-progress', { path: B })], null, null)).toEqual(card(B))
})
test('D7 done on the bound card unbinds', () => {
  expect(bindingAction([change('done', { path: A })], null, bound(A))).toEqual({ kind: 'unbind' })
})
test('D8 done on another card leaves the binding', () => {
  expect(bindingAction([change('done', { path: B })], null, bound(A))).toBeNull()
})
test('D9 done in another vault leaves the binding', () => {
  expect(bindingAction([change('done', { path: A }, 'other')], null, bound(A))).toBeNull()
})
test('D10 done with nothing bound does nothing', () => {
  expect(bindingAction([change('done', { path: A })], null, null)).toBeNull()
})
test('D11 a later in-progress beats an earlier done', () => {
  expect(bindingAction([change('done', { path: A }), change('in-progress', { path: B })], null, bound(A))).toEqual(card(B))
})
test('D12 a slash file name is skipped', () => {
  expect(bindingAction([change('in-progress', { file: 'a/b' }, null)], CFG, null)).toBeNull()
})
test('D13 the change\'s own vault beats the config vault', () => {
  expect(bindingAction([change('in-progress', { file: 'a' }, 'other')], CFG, null)).toEqual({ kind: 'bind', card: { cardPath: A, vault: 'other', project: 'cc-plugins' } })
})

test('R1 a cc-mobile record reads back', () => {
  const text = '{"cardPath":"pm/cc-plugins/tasks/a.md","vault":"obsidian","project":"cc-plugins","paneId":"%12","createdAt":"2026-10-07T01:00:00Z"}'
  expect(bindingOf(text)).toEqual({ cardPath: A, vault: 'obsidian', project: 'cc-plugins' })
})
test('R2 non-JSON is no binding', () => expect(bindingOf('not json')).toBeNull())
test('R3 a missing cardPath is no binding', () => expect(bindingOf('{"vault":"obsidian"}')).toBeNull())
test('R4 the project falls back to the cardPath', () => {
  expect(bindingOf('{"cardPath":"pm/p/tasks/a.md","vault":"obsidian"}')).toEqual({ cardPath: 'pm/p/tasks/a.md', vault: 'obsidian', project: 'p' })
})
test('R5 a non-object is no binding', () => {
  expect(bindingOf('[]')).toBeNull()
  expect(bindingOf('null')).toBeNull()
})
test('R6 a non-string cardPath is no binding', () => expect(bindingOf('{"cardPath":7,"vault":"obsidian"}')).toBeNull())

test('F1 OBW_LAUNCHES_DIR wins', () => expect(bindingPath('/alt', '/Users/u', 'sid-1')).toBe('/alt/sid-1.json'))
test('F2 HOME is the fallback', () => expect(bindingPath(undefined, '/Users/u', 'sid-1')).toBe('/Users/u/.claude-mobile/launches/sid-1.json'))
test('F3 an empty launches dir falls back', () => expect(bindingPath('', '/Users/u', 'sid-1')).toBe('/Users/u/.claude-mobile/launches/sid-1.json'))
test('F4 no HOME is fine with a launches dir', () => expect(bindingPath('/alt', undefined, 'sid-1')).toBe('/alt/sid-1.json'))
test('F5 nothing set is null', () => expect(bindingPath(undefined, undefined, 'sid-1')).toBeNull())
test('F6 empty values are null', () => expect(bindingPath('', '', 'sid-1')).toBeNull())
test('BF-R1 a relative or tilde directory is null', () => {
  expect(bindingPath('rel/dir', '/Users/u', 'sid-1')).toBeNull()
  expect(bindingPath(undefined, '~', 'sid-1')).toBeNull()
  expect(bindingPath('~/x', undefined, 'sid-1')).toBeNull()
  expect(bindingPath('/l', '/Users/u', 'sid-1')).toBe('/l/sid-1.json')
  expect(bindingPath(undefined, '/Users/u', 'sid-1')).toBe('/Users/u/.claude-mobile/launches/sid-1.json')
})
