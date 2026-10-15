import { describe, expect, test } from 'claude-code/testing'
import { queryArgv, queryOutput, readArgv, readOutput } from '../hooks/vault.ts'
import type { Run } from '../hooks/vault.ts'

const SCOPE = { vault: 'obsidian', project: 'cc-plugins' }
const exited = (stdout: string, exitCode = 0, stderr = ''): Run => ({ kind: 'exited', exitCode, stdout, stderr })

describe('queryArgv', () => {
  test('lists the All Tasks view of the project dashboard as JSON', () => {
    expect(queryArgv(SCOPE)).toEqual({
      argv: ['obsidian', 'vault=obsidian', 'base:query', 'path=pm/cc-plugins/dashboard.base', 'view=All Tasks', 'format=json'],
    })
  })

  test('refuses an empty vault, and a project that is empty or holds a separator, space, bracket or quote', () => {
    expect(queryArgv({ vault: '', project: 'cc-plugins' })).toEqual({ refused: 'vault' })
    for (const project of ['', 'a/b', 'a b', 'a[b', 'a"b']) expect(queryArgv({ vault: 'obsidian', project })).toEqual({ refused: 'project' })
  })

  test('refuses a vault name with a control character, in both argv builders', () => {
    expect(queryArgv({ vault: 'obs\u0007idian', project: 'cc-plugins' })).toEqual({ refused: 'vault' })
    expect(readArgv({ vault: 'obs\nidian', project: 'cc-plugins' }, 'pm/cc-plugins/tasks/a.md')).toEqual({ refused: 'vault' })
  })
})

describe('readArgv', () => {
  test('an empty path is refused', () => {
    expect(readArgv(SCOPE, '')).toEqual({ refused: 'path' })
  })

  test('a path with dot segments, another project, or a non-card is refused; an archived card is read', () => {
    expect(readArgv(SCOPE, 'pm/cc-plugins/tasks/../x.md')).toEqual({ refused: 'path' })
    expect(readArgv(SCOPE, 'pm/other/tasks/a.md')).toEqual({ refused: 'path' })
    expect(readArgv(SCOPE, 'pm/cc-plugins/tasks/a.txt')).toEqual({ refused: 'path' })
    expect(readArgv(SCOPE, 'pm/cc-plugins/tasks/archive/a.md')).toEqual({
      argv: ['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/archive/a.md'],
    })
  })
})

describe('queryOutput', () => {
  test('a CLI error on stdout with exit 0 is shown as the error', () => {
    expect(queryOutput(exited('Error: base not found'))).toEqual({ kind: 'error', message: 'Error: base not found' })
  })

  test('rows with a string path are read; an empty list is empty', () => {
    const [row] = (queryOutput(exited('[{"path":"pm/cc-plugins/tasks/a.md","status":"done","completed":"2026-10-01","title":"A"}]')) as any).rows
    expect(row).toMatchObject({ path: 'pm/cc-plugins/tasks/a.md', status: 'done', completed: '2026-10-01' })
    expect(queryOutput(exited('[]'))).toEqual({ kind: 'empty' })
  })

  test('a run that did not start or exited non-zero is an error with the CLI text', () => {
    expect(queryOutput({ kind: 'rejected' }).kind).toBe('error')
    expect(queryOutput(exited('', 1, 'boom'))).toEqual({ kind: 'error', message: 'boom' })
  })
})

describe('readOutput', () => {
  test('a note read as its own text; an error line, a rejected run are errors', () => {
    expect(readOutput(exited('---\ntitle: a\n---\nbody'))).toEqual({ kind: 'card', text: '---\ntitle: a\n---\nbody' })
    expect(readOutput(exited('Error: File "x" not found.'))).toEqual({ kind: 'error', message: 'Error: File "x" not found.' })
    expect(readOutput({ kind: 'rejected' }).kind).toBe('error')
  })
})
