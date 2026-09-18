import { describe, expect, test } from 'claude-code/testing'
import { accountDataIn } from './fixtures/account-data.ts'
import { SNAPSHOT, SNAPSHOT_STDOUT } from './fixtures/snapshot.ts'

describe('the committed omp snapshot', () => {
  test('carries no account data', () => {
    expect(accountDataIn(SNAPSHOT)).toEqual([])
  })

  test('the guard flags a planted metadata object and the email inside it', () => {
    const found = accountDataIn({ reports: [{ metadata: { email: 'a@b.c' } }] })
    expect(found).toContain('reports.0.metadata')
    expect(found).toContain('reports.0.metadata.email')
  })

  test('the guard flags a project id in a limit scope', () => {
    expect(accountDataIn({ reports: [{ limits: [{ scope: { projectId: 'p' } }] }] })).toEqual([
      'reports.0.limits.0.scope.projectId',
    ])
  })

  test('the guard flags any string holding an address', () => {
    expect(accountDataIn({ note: 'mail x@y.z' })).toEqual(['note'])
  })

  test('the stubbed stdout keeps omp report order', () => {
    expect(JSON.parse(SNAPSHOT_STDOUT).reports.map((r: { provider: string }) => r.provider)).toEqual([
      'openai-codex',
      'ollama-cloud',
      'google-antigravity',
      'xai-oauth',
      'cursor',
      'anthropic',
    ])
  })
})
