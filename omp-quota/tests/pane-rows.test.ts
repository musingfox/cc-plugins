import { describe, expect, test } from 'claude-code/testing'
import { paneModelOf } from '../hooks/pane-rows.ts'
import { readUsage } from '../hooks/usage.ts'
import type { LimitQuota } from '../hooks/usage.ts'
import { SNAPSHOT_STDOUT } from './fixtures/snapshot.ts'

const NOW = 1789708507153

function fixtureUsage() {
  const reading = readUsage({ kind: 'exited', exitCode: 0, stdout: SNAPSHOT_STDOUT })
  if (!reading.ok) throw new Error(reading.reason)
  return reading.usage
}

function sectionOf(provider: string) {
  const model = paneModelOf({ usage: fixtureUsage(), failure: null, lastGoodAt: NOW }, NOW)
  return model.providers.find((p) => p.heading.startsWith(`${provider} `))!
}

function limit(id: string, over: Partial<LimitQuota> = {}): LimitQuota {
  return { id, label: 'L', windowLabel: 'W', resetsAt: null, share: null, status: null, ...over }
}

function rowsOf(limits: LimitQuota[]) {
  const usage = { providers: [{ provider: 'p', limits, share: null, status: null }] }
  return paneModelOf({ usage, failure: null, lastGoodAt: NOW }, NOW).providers[0]!.rows
}

describe('paneModelOf', () => {
  test('lists each codex limit with share, status, and time to reset', () => {
    const codex = sectionOf('openai-codex')
    expect(codex.heading).toBe('openai-codex 6%')
    expect(codex.rows).toEqual([
      { name: '5 hours', share: '100%', status: 'ok', resets: '4h 59m' },
      { name: '7 days', share: '6%', status: 'warning', resets: '1d 11h' },
    ])
  })

  test('tells repeated antigravity labels apart by their ids', () => {
    const antigravity = sectionOf('google-antigravity')
    expect(antigravity.rows.map((r) => r.name)).toEqual([
      'Gemini · Weekly',
      'Gemini · 5 Hour',
      'Claude & GPT (shared) · Weekly [anthropic]',
      'Claude & GPT (shared) · Weekly [openai]',
      'Claude & GPT (shared) · 5 Hour [anthropic]',
      'Claude & GPT (shared) · 5 Hour [openai]',
    ])
    expect(antigravity.rows[0]!.resets).toBe('6d 23h')
  })

  test('a limit without share or status shows dashes', () => {
    const cursor = sectionOf('cursor')
    expect(cursor.rows[0]).toEqual({ name: 'gpt-4 requests · Monthly', share: '—', status: '—', resets: '11h 25m' })
    expect(cursor.rows[1]!.share).toBe('0%')
    expect(cursor.rows[1]!.status).toBe('exhausted')
  })

  test('anthropic heading and reset times', () => {
    const anthropic = sectionOf('anthropic')
    expect(anthropic.heading).toBe('anthropic 86%')
    expect(anthropic.rows[0]!.resets).toBe('1h 44m')
    expect(anthropic.rows[1]!.resets).toBe('5d 15h')
  })

  test('a provider with no limits says so', () => {
    expect(sectionOf('ollama-cloud')).toEqual({ heading: 'ollama-cloud —', rows: [], empty: 'no limits reported' })
  })

  test('before any fetch settles the pane says it is fetching', () => {
    expect(paneModelOf({ usage: null, failure: null, lastGoodAt: null }, NOW)).toEqual({
      notice: 'Fetching omp usage',
      providers: [],
    })
  })

  test('with no good fetch yet the pane names the failure', () => {
    expect(paneModelOf({ usage: null, failure: 'omp exited 1', lastGoodAt: null }, NOW)).toEqual({
      notice: 'Unavailable: omp exited 1',
      providers: [],
    })
  })

  test('a failure after good data keeps the data and says how old it is', () => {
    const model = paneModelOf({ usage: fixtureUsage(), failure: 'omp did not answer', lastGoodAt: NOW - 720000 }, NOW)
    expect(model.notice).toBe('Stale: omp did not answer; showing data from 12m ago')
    expect(model.providers).toHaveLength(6)
  })

  test('a due reset reads now and a missing one reads a dash', () => {
    const rows = rowsOf([limit('a', { label: 'A', resetsAt: NOW - 1 }), limit('b', { label: 'B' })])
    expect(rows[0]!.resets).toBe('now')
    expect(rows[1]!.resets).toBe('—')
  })

  test('tags keep every id segment that differs within the repeat group', () => {
    const rows = rowsOf([limit('p:x:1'), limit('p:y:1'), limit('p:y:2')])
    expect(rows.map((r) => r.name)).toEqual(['L · W [x:1]', 'L · W [y:1]', 'L · W [y:2]'])
  })
})
