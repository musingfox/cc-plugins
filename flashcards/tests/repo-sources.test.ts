import { describe, expect, test } from 'claude-code/testing'
import { repoSources } from '../hooks/repo-sources.ts'
import { fake } from './fixtures/fake.ts'

const ROOT = '/work'
const file = (name: string) => ({ name, kind: 'file' as const })

describe('repoSources', () => {
  test('a spec document in docs/spec is a spec source; a directory or other extension is not', async () => {
    const { $ } = fake({
      files: { '/work/docs/spec/a.md': 'Rule a.' },
      dirs: { '/work/docs/spec': [file('a.md'), file('b.txt'), { name: 'sub', kind: 'dir' }] },
    })
    const detection = await repoSources($, ROOT)
    expect(detection.sources.map((s) => [s.path, s.type])).toEqual([['docs/spec/a.md', 'spec']])
  })

  test('ADRs come from the decision directories only, by the numbered name', async () => {
    const { $ } = fake({
      files: { '/work/docs/decisions/0001-use-x.md': 'x', '/work/adr/0002-y.md': 'y', '/work/docs/adr/0003-z.md': 'z' },
      dirs: {
        '/work/docs/decisions': [file('0001-use-x.md'), file('README.md'), file('1-bad.md')],
        '/work/docs/adr': [file('0003-z.md')],
        '/work/adr': [file('0002-y.md')],
      },
    })
    const detection = await repoSources($, ROOT)
    expect(detection.sources.map((s) => s.path)).toEqual(['adr/0002-y.md', 'docs/adr/0003-z.md', 'docs/decisions/0001-use-x.md'])
    expect(detection.sources.every((s) => s.type === 'adr')).toBe(true)
    expect(detection.status).toBe('ok')
  })

  test('no spec or decision directory is an empty, ok detection', async () => {
    expect(await repoSources(fake().$, ROOT)).toEqual({ sources: [], unreadable: [], status: 'ok' })
  })

  test('a directory whose listing fails is an error, and the other directories still contribute', async () => {
    const { $ } = fake({
      files: { '/work/adr/0002-y.md': 'y' },
      dirs: { '/work/docs/spec': { deny: 'EACCES' }, '/work/adr': [file('0002-y.md')] },
    })
    const detection = await repoSources($, ROOT)
    expect(detection.status).toBe('error')
    expect(detection.message).toBeTruthy()
    expect(detection.sources.map((s) => s.path)).toEqual(['adr/0002-y.md'])
  })

  test('a file whose read fails is unreadable and the others are kept', async () => {
    const { $ } = fake({
      files: { '/work/docs/spec/b.md': 'Rule b.' },
      dirs: { '/work/docs/spec': [file('a.md'), file('b.md')] },
    })
    const detection = await repoSources($, ROOT)
    expect(detection.unreadable).toEqual(['docs/spec/a.md'])
    expect(detection.sources.map((s) => s.path)).toEqual(['docs/spec/b.md'])
  })

  test('a symlink or other entry named like a spec is ignored', async () => {
    const { $ } = fake({ files: { '/work/docs/spec/x.md': 'x' }, dirs: { '/work/docs/spec': [{ name: 'x.md', kind: 'other' }] } })
    expect((await repoSources($, ROOT)).sources).toEqual([])
  })
})
