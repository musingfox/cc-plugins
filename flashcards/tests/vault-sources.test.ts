import { describe, expect, test } from 'claude-code/testing'
import { hashText } from '../hooks/hash.ts'
import { vaultSources } from '../hooks/vault-sources.ts'
import { fake } from './fixtures/fake.ts'

const CONFIG = { '/work/.obsidian.yaml': 'vault: obsidian\npm:\n  project: cc-plugins\n' }
const CARD = '---\ntitle: a\n---\nbody\n## Agent\nlog'

function rows(...items: { path: string; status?: string; completed?: string | null }[]) {
  return JSON.stringify(items.map((item) => ({ path: item.path, status: item.status ?? 'done', completed: item.completed ?? null, title: 't' })))
}

// Answers the base query with `query`, and each card read with its text from `cards` (a missing card is the CLI's miss).
function cli(query: string, cards: Record<string, string> = {}) {
  return (argv: string[]) => {
    if (argv[2] === 'base:query') return { exitCode: 0, stdout: query, stderr: '' }
    const path = argv[3]!.slice('path='.length)
    return { exitCode: 0, stdout: cards[path] ?? `Error: File "${path}" not found.\n`, stderr: '' }
  }
}

describe('vaultSources', () => {
  test('the done cards, archive included, newest first, each read at its own path', async () => {
    const query = rows(
      { path: 'pm/cc-plugins/tasks/a.md', completed: '2026-10-01' },
      { path: 'pm/cc-plugins/tasks/archive/b.md', completed: '2026-10-05' },
      { path: 'pm/cc-plugins/tasks/c.md', status: 'todo' },
    )
    const { $, runs } = fake({ files: CONFIG, run: cli(query, { 'pm/cc-plugins/tasks/a.md': CARD, 'pm/cc-plugins/tasks/archive/b.md': CARD }) })
    const detection = await vaultSources($)
    expect(detection.status).toBe('ok')
    expect(detection.sources.map((s) => s.path)).toEqual(['pm/cc-plugins/tasks/archive/b.md', 'pm/cc-plugins/tasks/a.md'])
    expect(runs.map((r) => r.argv[2])).toEqual(['base:query', 'read', 'read'])
    expect(runs[1]!.argv).toEqual(['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/tasks/archive/b.md'])
  })

  test('the source text is the card above its agent log, and its hash is that text', async () => {
    const query = rows({ path: 'pm/cc-plugins/tasks/a.md' })
    const { $ } = fake({ files: CONFIG, run: cli(query, { 'pm/cc-plugins/tasks/a.md': CARD }) })
    const [source] = (await vaultSources($)).sources
    expect(source!.text).toBe('---\ntitle: a\n---\nbody\n')
    expect(source!.hash).toBe(await hashText('---\ntitle: a\n---\nbody\n'))
  })

  test('a row whose path is refused is unreadable and does not stop the others', async () => {
    const query = rows({ path: '' }, { path: 'pm/cc-plugins/tasks/../x.md' }, { path: 'pm/cc-plugins/tasks/a.md' })
    const { $, runs } = fake({ files: CONFIG, run: cli(query, { 'pm/cc-plugins/tasks/a.md': CARD }) })
    const detection = await vaultSources($)
    expect(detection.status).toBe('ok')
    expect(detection.unreadable).toEqual(['', 'pm/cc-plugins/tasks/../x.md'])
    expect(detection.sources.map((s) => s.path)).toEqual(['pm/cc-plugins/tasks/a.md'])
    expect(runs.some((r) => r.argv.includes('path=pm/cc-plugins/tasks/../x.md'))).toBe(false)
  })

  test('a query error is an error status with the CLI text and no sources', async () => {
    const { $ } = fake({ files: CONFIG, run: cli('Error: no such base') })
    const detection = await vaultSources($)
    expect(detection.status).toBe('error')
    expect(detection.message).toContain('no such base')
    expect(detection.sources).toEqual([])
  })

  test('without a config there is nothing to read and no CLI run', async () => {
    const { $, runs } = fake({})
    expect(await vaultSources($)).toMatchObject({ status: 'unconfigured', sources: [] })
    expect(runs).toEqual([])
  })

  test('every CLI run carries the 10 second timeout', async () => {
    const { $, runs } = fake({ files: CONFIG, run: cli(rows({ path: 'pm/cc-plugins/tasks/a.md' }), { 'pm/cc-plugins/tasks/a.md': CARD }) })
    await vaultSources($)
    expect(runs.length).toBe(2)
    expect(runs.every((r) => r.timeoutMs === 10000)).toBe(true)
  })
})
