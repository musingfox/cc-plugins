import { describe, expect, test } from 'claude-code/testing'
import { repoKey } from '../hooks/deck-store.ts'
import type { Deck } from '../types'
import { cards, SESSION, world } from './fixtures/world.ts'

const CONFIG = '/work/.obsidian.yaml'
const VAULT_CONFIG = 'vault: obsidian\npm:\n  project: cc-plugins\n'

// Twenty-five pending task cards (the first build picks 20 in two batches) and the one-card answer for each.
function taskWorld() {
  const paths = Array.from({ length: 25 }, (_, i) => `pm/cc-plugins/tasks/t${String(i + 1).padStart(2, '0')}.md`)
  const query = JSON.stringify(paths.map((path, i) => ({ path, status: 'done', completed: `2026-10-${String(i + 1).padStart(2, '0')}`, title: 't' })))
  const reads = Object.fromEntries(paths.map((path, i) => [path, `---\ntitle: t${i}\n---\nWe shipped item ${i}.\n`]))
  return { paths, query, reads }
}

// One valid card per source of a batch: the source's own sentence quoted as the answer's support.
function answerFor(paths: string[]) {
  return `[${paths.map((path) => `{"source":"${path}","kind":"why","q":"Why was ${path.slice(-7, -3)} shipped?","a":"It shipped.","quote":"We shipped item ${Number(path.slice(-5, -3)) - 1}."}`).join(',')}]`
}

const reply = (agentId: string, answer: string, reason = 'answer') => ({ agentId, reason, answer, durationMs: 1, isAborted: false, turnId: agentId }) as any

describe('the build report', () => {
  test('when the last batch lands the user gets one summary of cards added and sources remaining', async ($, on) => {
    const { query, reads, paths } = taskWorld()
    const seen = world(on, { files: { [CONFIG]: VAULT_CONFIG }, query, reads })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    await $.turn.complete(reply('agent-1', answerFor(paths.slice(15, 25))))
    expect(seen.toasts.filter((t) => t.startsWith('Flashcards:'))).toEqual([])
    await $.turn.complete(reply('agent-2', answerFor(paths.slice(5, 15))))
    expect(seen.toasts.filter((t) => t.startsWith('Flashcards:'))).toEqual(['Flashcards: 20 cards added, 5 sources remain.'])
    expect(seen.invalidates).toBeGreaterThan(0)
  })

  test('a batch that errors is counted as failed sources, not added', async ($, on) => {
    const { query, reads, paths } = taskWorld()
    const seen = world(on, { files: { [CONFIG]: VAULT_CONFIG }, query, reads })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    await $.turn.complete(reply('agent-1', '', 'error'))
    await $.turn.complete(reply('agent-2', answerFor(paths.slice(5, 15))))
    expect(seen.toasts.filter((t) => t.startsWith('Flashcards:'))).toEqual(['Flashcards: 10 cards added, 10 sources failed and wait for the next build, 15 sources remain.'])
  })

  test('a card whose quote is not in its source counts as dropped', async ($, on) => {
    const seen = world(on, { files: { '/work/docs/spec/a.md': 'One. Two. Three.\n' }, dirs: { '/work/docs/spec': [{ name: 'a.md', kind: 'file' }] } })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    const answer = '[{"source":"docs/spec/a.md","kind":"rule","q":"Q1 is?","a":"A.","quote":"One."},{"source":"docs/spec/a.md","kind":"rule","q":"Q2 is?","a":"A.","quote":"Missing."},{"source":"docs/spec/a.md","kind":"rule","q":"Q3 is?","a":"A.","quote":"Two."},{"source":"docs/spec/a.md","kind":"rule","q":"Q4 is?","a":"A.","quote":"Gone."}]'
    await $.turn.complete(reply('agent-1', answer))
    expect(seen.toasts.filter((t) => t.startsWith('Flashcards:'))).toEqual(['Flashcards: 2 cards added, 2 rejected by the checks, 0 sources remain.'])
  })

  test('every batch denied at spawn reports zero added and the next build is not stopped', async ($, on) => {
    const { query, reads } = taskWorld()
    const seen = world(on, { files: { [CONFIG]: VAULT_CONFIG }, query, reads, spawn: () => ({ deny: 'no' }) })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts.filter((t) => t.startsWith('Flashcards:'))).toEqual(['Flashcards: 0 cards added, 20 sources failed and wait for the next build, 25 sources remain.'])
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.spawns.length).toBe(4)
  })

  test('the report waits for the last batch of a build', async ($, on) => {
    const { query, reads, paths } = taskWorld()
    const seen = world(on, { files: { [CONFIG]: VAULT_CONFIG }, query, reads })
    await $.session.start(SESSION)
    await $.command.run(cards('build'))
    await seen.clock.settle()
    expect(seen.toasts.filter((t) => t.startsWith('Flashcards:'))).toEqual([])
    await $.turn.complete(reply('agent-1', answerFor(paths.slice(15, 25))))
    expect(seen.toasts.filter((t) => t.startsWith('Flashcards:'))).toEqual([])
  })
})
