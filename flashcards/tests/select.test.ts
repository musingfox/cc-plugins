import { describe, expect, test } from 'claude-code/testing'
import { selectBuild } from '../hooks/select.ts'
import type { Deck, Source } from '../types'

const EMPTY: Deck = { v: 1, sources: {}, cards: [] }

function spec(path: string, hash = 'h'): Source {
  return { path, type: 'spec', text: '', hash, completed: null }
}

function task(path: string, completed: string | null, hash = 'h'): Source {
  return { path, type: 'task', text: '', hash, completed }
}

const sizes = (batches: Source[][]) => batches.map((batch) => batch.length)

describe('selectBuild', () => {
  test('the 20 newest of 25 pending tasks, in two batches of ten', () => {
    const tasks = Array.from({ length: 25 }, (_, i) => task(`t${String(i).padStart(2, '0')}`, `2026-10-${String(i + 1).padStart(2, '0')}`))
    const result = selectBuild(EMPTY, tasks)
    expect(sizes(result.batches)).toEqual([10, 10])
    expect(result.pendingCount).toBe(25)
    expect(result.remaining).toBe(5)
    expect(result.batches.flat().map((s) => s.path)).toEqual(tasks.slice(5).reverse().map((s) => s.path))
  })

  test('specs and ADRs come first by path, then tasks by newest completion', () => {
    const sources = [task('c', '2026-10-01'), spec('b'), task('a', '2026-10-05'), spec('a'), task('d', '2026-10-09')]
    const [batch] = selectBuild(EMPTY, sources).batches
    expect(batch!.map((s) => s.path)).toEqual(['a', 'b', 'd', 'a', 'c'])
  })

  test('a source whose recorded hash matches is not pending', () => {
    const deck: Deck = { v: 1, sources: { 'docs/spec/a.md': { hash: 'same', type: 'spec' } }, cards: [] }
    const result = selectBuild(deck, [spec('docs/spec/a.md', 'same'), spec('docs/spec/b.md', 'x')])
    expect(result.pendingCount).toBe(1)
    expect(result.batches.flat().map((s) => s.path)).toEqual(['docs/spec/b.md'])
  })

  test('the batch counts for 23, 7 and 0 pending sources', () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => task(`t${i}`, null))
    const twentyThree = selectBuild(EMPTY, make(23))
    expect(sizes(twentyThree.batches)).toEqual([10, 10])
    expect(twentyThree.remaining).toBe(3)
    expect(sizes(selectBuild(EMPTY, make(7)).batches)).toEqual([7])
    expect(selectBuild(EMPTY, []).batches).toEqual([])
  })

  test('a task with no completion date sorts after the dated ones, then by path', () => {
    const [batch] = selectBuild(EMPTY, [task('z', null), task('y', '2026-10-01'), task('b', null)]).batches
    expect(batch!.map((s) => s.path)).toEqual(['y', 'b', 'z'])
  })
})
