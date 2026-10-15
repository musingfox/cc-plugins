import { describe, expect, test } from 'claude-code/testing'
import { repoKey } from '../hooks/deck-store.ts'
import { hashText } from '../hooks/hash.ts'
import type { Deck } from '../types'
import { cards, SESSION, world } from './fixtures/world.ts'

const SPECS = { 'docs/spec/a.md': 'Rule one.\n', 'docs/spec/b.md': 'Rule two.\n', 'docs/spec/c.md': 'Rule three.\n' }
const ABSOLUTE = (specs: Record<string, string>) => Object.fromEntries(Object.entries(specs).map(([path, text]) => [`/work/${path}`, text]))
const SPEC_DIR = [
  { name: 'a.md', kind: 'file' as const },
  { name: 'b.md', kind: 'file' as const },
  { name: 'c.md', kind: 'file' as const },
]
const CONFIG = '/work/.obsidian.yaml'
const VAULT_CONFIG = 'vault: obsidian\npm:\n  project: cc-plugins\n'

// Twenty-five done task cards, one per day of October, and the card text each read answers with.
function taskWorld() {
  const paths = Array.from({ length: 25 }, (_, i) => `pm/cc-plugins/tasks/t${String(i + 1).padStart(2, '0')}.md`)
  const query = JSON.stringify(paths.map((path, i) => ({ path, status: 'done', completed: `2026-10-${String(i + 1).padStart(2, '0')}`, title: 't' })))
  const reads = Object.fromEntries(paths.map((path, i) => [path, `---\ntitle: t${i}\n---\nbody ${i}\n`]))
  return { paths, query, reads }
}

describe('/cards build starts the background batches', () => {
  test('three specs go to one Haiku spawn with all three texts and no subagent type', async ($, on) => {
    const seen = world(on, { files: ABSOLUTE(SPECS), dirs: { '/work/docs/spec': SPEC_DIR } })
    await $.session.start(SESSION)
    expect(await $.command.run(cards('build'))).toEqual({})
    await seen.clock.settle()
    expect(seen.spawns).toHaveLength(1)
    const [spawn] = seen.spawns
    expect(spawn.model).toBe('haiku')
    expect(spawn.subagentType).toBeUndefined()
    for (const text of Object.values(SPECS)) expect(spawn.prompt).toContain(text.trim())
  })

  test('the twenty newest of 25 task cards go out as two batches of ten, with the start toast', async ($, on) => {
    const { query, reads, paths } = taskWorld()
    const seen = world(on, { files: { [CONFIG]: VAULT_CONFIG }, query, reads })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.spawns).toHaveLength(2)
    expect(seen.spawns.map((s) => s.prompt.split('=== SOURCE').length - 1)).toEqual([10, 10])
    expect(seen.spawns[0].prompt).toContain(paths[24])
    expect(seen.spawns[1].prompt).not.toContain(paths[0])
    expect(seen.toasts[0]).toContain('20 sources in 2 batch(es)')
    expect(seen.toasts[0]).toContain('5 more sources')
  })

  test('a deck that records every source at its current hash spawns nothing and says so', async ($, on) => {
    const key = await repoKey('/work')
    const deck: Deck = { v: 1, sources: { 'docs/spec/a.md': { hash: await hashText('Rule one.\n'), type: 'spec' } }, cards: [] }
    const seen = world(on, { store: { [`deck:${key}`]: deck }, files: { '/work/docs/spec/a.md': 'Rule one.\n' }, dirs: { '/work/docs/spec': [SPEC_DIR[0]!] } })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.spawns).toEqual([])
    expect(seen.toasts).toEqual(['Flashcards deck is up to date: 0 cards from 1 sources.'])
  })

  test('no docs and no obsidian config says there is nothing to build', async ($, on) => {
    const seen = world(on, {})
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts).toEqual(['No sources found. Add docs/spec/*.md, an ADR directory, or a .obsidian.yaml with pm.project.'])
    expect(seen.spawns).toEqual([])
  })

  test('a denied first batch is skipped and the second still spawns', async ($, on) => {
    const { query, reads } = taskWorld()
    const seen = world(on, { files: { [CONFIG]: VAULT_CONFIG }, query, reads, spawn: (n) => (n === 1 ? { deny: 'no' } : { model: 'haiku', agentId: `agent-${n}` }) })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.spawns).toHaveLength(2)
  })
  test('a spawn that answers no id is tracked under the id the agent list gives it', async ($, on) => {
    const key = await repoKey('/work')
    const seen = world(on, { files: ABSOLUTE(SPECS), dirs: { '/work/docs/spec': SPEC_DIR }, spawn: () => ({ model: 'haiku' }) })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    await $.turn.complete({ agentId: 'agent-1', reason: 'answer', answer: '[]', durationMs: 1, isAborted: false, turnId: 't1' })
    expect(Object.keys((seen.store[`deck:${key}`] as Deck).sources).sort()).toEqual(['docs/spec/a.md', 'docs/spec/b.md', 'docs/spec/c.md'])
  })

  test('a build that throws after the guard tells the user why it stopped and frees the guard', async ($, on) => {
    const seen = world(on, { files: ABSOLUTE(SPECS), dirs: { '/work/docs/spec': SPEC_DIR }, spawn: () => ({ model: 'haiku' }), listDeny: 'agent list unavailable' })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts.some((t) => t.startsWith('Flashcards build stopped:'))).toBe(true)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.spawns).toHaveLength(2)
  })
})
