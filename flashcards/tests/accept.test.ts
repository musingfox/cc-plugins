import { describe, expect, test } from 'claude-code/testing'
import { acceptCards } from '../hooks/accept.ts'
import type { RawCard } from '../hooks/reply.ts'
import type { Source } from '../types'

const SPEC_TEXT = 'Rules must hold. Never skip the gate.'
const TASK_TEXT = 'We shipped the pane.\n'

const spec: Source = { path: 'docs/spec/rules.md', type: 'spec', text: SPEC_TEXT, hash: 'hs', completed: null }
const task: Source = { path: 'pm/cc-plugins/tasks/done.md', type: 'task', text: TASK_TEXT, hash: 'ht', completed: '2026-10-01' }
const adr: Source = { path: 'docs/decisions/0001-x.md', type: 'adr', text: 'Because it was cheap.', hash: 'ha', completed: null }

function raw(source: string, overrides: Record<string, unknown> = {}): RawCard {
  return { source, kind: source.startsWith('docs/spec') ? 'rule' : 'why', q: 'Which rule guards the gate?', a: 'Never skip it.', quote: 'Never skip the gate.', ...overrides }
}

describe('acceptCards', () => {
  test('a card quoting its source verbatim is accepted with the source fingerprint', async () => {
    const { accepted, dropped } = await acceptCards([raw(spec.path)], [spec])
    expect(dropped).toEqual([])
    expect(accepted).toHaveLength(1)
    expect(accepted[0]).toMatchObject({ sourcePath: spec.path, sourceHash: 'hs', kind: 'rule', quote: 'Never skip the gate.' })
    expect(accepted[0]!.id).toMatch(/^[0-9a-f]{16}$/)
  })

  test('a quote that is not in the source is dropped; an empty quote is dropped as fields', async () => {
    const result = await acceptCards([raw(spec.path, { quote: 'Never skip the gates.' }), raw(spec.path, { quote: '' })], [spec])
    expect(result.accepted).toEqual([])
    expect(result.dropped.map((d) => d.reason)).toEqual(['quote', 'fields'])
  })

  test('kinds are checked per source type', async () => {
    const cards = [
      raw(task.path, { kind: 'rule', quote: 'We shipped the pane.' }),
      raw(task.path, { kind: 'why', quote: 'We shipped the pane.' }),
      raw(spec.path, { kind: 'why' }),
      raw(spec.path, { kind: 'rule' }),
      raw(adr.path, { kind: 'what-for', quote: 'Because it was cheap.' }),
    ]
    const result = await acceptCards(cards, [task, spec, adr])
    expect(result.dropped.map((d) => d.reason)).toEqual(['kind', 'kind', 'kind'])
    expect(result.accepted.map((c) => c.kind)).toEqual(['why', 'rule'])
  })

  test('a source outside the batch is dropped as unknown-source', async () => {
    const result = await acceptCards([raw('not/in/batch.md')], [spec])
    expect(result.dropped).toEqual([{ reason: 'unknown-source' }])
  })

  test('the same question twice from one source is a duplicate; from two sources it is two cards', async () => {
    const twice = await acceptCards([raw(spec.path), raw(spec.path)], [spec])
    expect(twice.accepted).toHaveLength(1)
    expect(twice.dropped.map((d) => d.reason)).toEqual(['duplicate'])
    const other: Source = { ...spec, path: 'docs/spec/other.md' }
    const split = await acceptCards([raw(spec.path), raw(other.path)], [spec, other])
    expect(split.accepted).toHaveLength(2)
    expect(split.accepted[0]!.id).not.toBe(split.accepted[1]!.id)
  })

  test('a fourth accepted card of one source is over-limit', async () => {
    const cards = ['A', 'B', 'C', 'D', 'E'].map((letter) => raw(task.path, { q: `Question ${letter}?`, kind: 'why', quote: 'We shipped the pane.' }))
    const result = await acceptCards(cards, [task])
    expect(result.accepted).toHaveLength(3)
    expect(result.dropped.map((d) => d.reason)).toEqual(['over-limit', 'over-limit'])
  })

  test('a card without a string q is dropped as fields', async () => {
    const result = await acceptCards([{ source: spec.path, kind: 'rule', q: 42, quote: 'Never skip the gate.', a: 'x' }], [spec])
    expect(result.dropped).toEqual([{ reason: 'fields' }])
  })

  test('a quote that lies only in a cut-off part of a task is dropped', async () => {
    const cut: Source = { ...task, text: 'Body only.\n' }
    const result = await acceptCards([raw(task.path, { kind: 'why', quote: 'cut part' })], [cut])
    expect(result.dropped.map((d) => d.reason)).toEqual(['quote'])
  })
})
