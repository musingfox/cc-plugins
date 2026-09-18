import { describe, expect, test } from 'claude-code/testing'
import { readUsage, remainingShareOf, worsenedProviders } from '../hooks/usage.ts'
import { SNAPSHOT, SNAPSHOT_STDOUT } from './fixtures/snapshot.ts'

function usageOf(stdout: string) {
  const reading = readUsage({ kind: 'exited', exitCode: 0, stdout })
  if (!reading.ok) throw new Error(reading.reason)
  return reading.usage
}

function fixtureWith(statuses: Record<string, string | undefined>) {
  const copy = JSON.parse(SNAPSHOT_STDOUT)
  for (const report of copy.reports)
    for (const limit of report.limits)
      if (limit.id in statuses) {
        if (statuses[limit.id] === undefined) delete limit.status
        else limit.status = statuses[limit.id]
      }
  return usageOf(JSON.stringify(copy))
}

function providerLimitIds(provider: string) {
  return SNAPSHOT.reports.find((r) => r.provider === provider)!.limits.map((l) => l.id)
}

function allOf(provider: string, status: string | undefined) {
  return Object.fromEntries(providerLimitIds(provider).map((id) => [id, status]))
}

function reportsWith(limits: object[][], provider = 'p') {
  return JSON.stringify({ reports: limits.map((l) => ({ provider, limits: l })) })
}

describe('remainingShareOf', () => {
  test('prefers remainingFraction', () => {
    // The kit has no toBeCloseTo; this is its default precision (2 digits).
    expect(Math.abs(remainingShareOf({ remainingFraction: 0.06000000000000005, usedFraction: 0.94 })! - 0.06)).toBeLessThan(0.005)
  })

  test('falls back to one minus usedFraction', () => {
    expect(remainingShareOf({ used: 100, usedFraction: 1, unit: 'percent' })).toBe(0)
  })

  test('clamps an overdrawn usedFraction to zero', () => {
    expect(remainingShareOf({ usedFraction: 1.009 })).toBe(0)
  })

  test('is none when neither fraction is given', () => {
    expect(remainingShareOf({ used: 0, unit: 'requests' })).toBe(null)
  })

  test('clamps a remainingFraction above one', () => {
    expect(remainingShareOf({ remainingFraction: 1.2 })).toBe(1)
  })

  test('ignores a remainingFraction that is not a number', () => {
    expect(remainingShareOf({ remainingFraction: 'x', usedFraction: 0.25 })).toBe(0.75)
  })

  test('is none for a missing amount', () => {
    expect(remainingShareOf(undefined)).toBe(null)
  })
})

describe('readUsage', () => {
  test('summarises every provider of the snapshot in omp order', () => {
    const reading = readUsage({ kind: 'exited', exitCode: 0, stdout: SNAPSHOT_STDOUT })
    expect(reading.ok).toBe(true)
    const providers = usageOf(SNAPSHOT_STDOUT).providers
    expect(providers.map((p) => p.provider)).toEqual([
      'openai-codex',
      'ollama-cloud',
      'google-antigravity',
      'xai-oauth',
      'cursor',
      'anthropic',
    ])
    expect(providers.map((p) => p.limits.length)).toEqual([2, 0, 6, 1, 4, 3])
    expect(providers.map((p) => p.status)).toEqual(['warning', null, 'ok', 'ok', 'exhausted', 'ok'])
    const shares = providers.map((p) => p.share)
    const expected = [0.06, null, 1, 1, 0, 0.86]
    expect(shares.map((s) => s === null)).toEqual(expected.map((s) => s === null))
    shares.forEach((s, i) => {
      if (s !== null) expect(Math.abs(s - expected[i]!)).toBeLessThan(0.005)
    })
  })

  test('keeps a limit with no status or fractions, and reads usedFraction alone', () => {
    const cursor = usageOf(SNAPSHOT_STDOUT).providers.find((p) => p.provider === 'cursor')!
    const gpt4 = cursor.limits.find((l) => l.id === 'cursor:requests:gpt-4')!
    expect(gpt4.status).toBe(null)
    expect(gpt4.share).toBe(null)
    expect(gpt4.resetsAt).toBe(1789749656000)
    expect(cursor.limits.find((l) => l.id === 'cursor:usd:individual-auto')!.share).toBe(0)
  })

  test('an empty report list is a failure, not data', () => {
    expect(readUsage({ kind: 'exited', exitCode: 0, stdout: '{"reports":[],"capacity":{}}' })).toEqual({
      ok: false,
      reason: 'omp reported no providers',
    })
  })

  test('a non-zero exit is a failure whatever stdout holds', () => {
    expect(readUsage({ kind: 'exited', exitCode: 1, stdout: SNAPSHOT_STDOUT })).toEqual({
      ok: false,
      reason: 'omp exited 1',
    })
  })

  test('stdout that is not JSON is a failure', () => {
    expect(readUsage({ kind: 'exited', exitCode: 0, stdout: 'not json' })).toEqual({
      ok: false,
      reason: 'omp output unreadable',
    })
  })

  test('a run that never answered is a failure', () => {
    expect(readUsage({ kind: 'rejected' })).toEqual({ ok: false, reason: 'omp did not answer' })
  })

  test('reports with the same provider merge into one', () => {
    const providers = usageOf(reportsWith([[{ id: 'a' }], [{ id: 'b' }]], 'cursor')).providers
    expect(providers.map((p) => p.provider)).toEqual(['cursor'])
    expect(providers[0]!.limits.map((l) => l.id)).toEqual(['a', 'b'])
  })

  test('an unknown status reads as no status', () => {
    const provider = usageOf(reportsWith([[{ id: 'a', status: 'bogus' }]])).providers[0]!
    expect(provider.limits[0]!.status).toBe(null)
    expect(provider.status).toBe(null)
  })
})

describe('worsenedProviders', () => {
  const fixture = usageOf(SNAPSHOT_STDOUT)

  test('the first good fetch has nothing to compare with', () => {
    expect(worsenedProviders(null, fixture)).toEqual([])
  })

  test('a provider going from ok to warning is reported', () => {
    const previous = fixtureWith({ 'openai-codex:secondary': 'ok' })
    expect(worsenedProviders(previous, fixture)).toEqual([{ provider: 'openai-codex', status: 'warning' }])
  })

  test('an unchanged fetch reports nothing', () => {
    expect(worsenedProviders(fixture, fixture)).toEqual([])
  })

  test('warning to exhausted is not reported', () => {
    const previous = fixture
    const current = fixtureWith({ 'openai-codex:secondary': 'exhausted' })
    expect(worsenedProviders(previous, current)).toEqual([])
  })

  test('a provider with no previous status is not reported', () => {
    const previous = fixtureWith(allOf('openai-codex', undefined))
    expect(worsenedProviders(previous, fixture)).toEqual([])
  })

  test('a provider losing its status is not reported', () => {
    const current = fixtureWith(allOf('anthropic', undefined))
    expect(worsenedProviders(fixture, current)).toEqual([])
  })

  test('a provider that first appears is not reported', () => {
    const previous = { providers: fixture.providers.filter((p) => p.provider !== 'cursor') }
    expect(worsenedProviders(previous, fixture)).toEqual([])
  })

  test('several worsened providers are reported in current order', () => {
    const previous = fixtureWith({ 'openai-codex:secondary': 'ok' })
    const current = fixtureWith({ 'anthropic:5h': 'exhausted' })
    expect(worsenedProviders(previous, current)).toEqual([
      { provider: 'openai-codex', status: 'warning' },
      { provider: 'anthropic', status: 'exhausted' },
    ])
  })
})
