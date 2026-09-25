import { describe, expect, test } from 'claude-code/testing'
import { quotaModelOf, shareColorOf } from '../hooks/quota-model.ts'
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
  const model = quotaModelOf({ usage: fixtureUsage(), failure: null, lastGoodAt: NOW }, NOW)
  return model.providers.find((p) => p.provider === provider)!
}

function limit(id: string, over: Partial<LimitQuota> = {}): LimitQuota {
  return { id, label: 'L', windowLabel: 'W', resetsAt: null, share: null, status: null, ...over }
}

function windowsOf(limits: LimitQuota[]) {
  const usage = { providers: [{ provider: 'p', limits, share: null, status: null }] }
  return quotaModelOf({ usage, failure: null, lastGoodAt: NOW }, NOW).providers[0]!.windows
}

describe('quotaModelOf', () => {
  test('lists providers from least share left to most, dropping those without limits', () => {
    const model = quotaModelOf({ usage: fixtureUsage(), failure: null, lastGoodAt: NOW }, NOW)
    expect(model.providers.map((p) => p.provider)).toEqual([
      'cursor',
      'openai-codex',
      'anthropic',
      'google-antigravity',
      'xai-oauth',
    ])
  })

  test('one window per distinct window label, soonest reset first', () => {
    expect(sectionOf('openai-codex').windows).toEqual([
      { window: '5 hours', share: '100%', shareColor: '#46a758', status: null, resets: '4h 59m' },
      { window: '7 days', share: '6%', shareColor: '#e5484d', status: 'warning', resets: '1d 11h' },
    ])
  })

  test('a window shows the least share among its limits', () => {
    expect(sectionOf('anthropic').windows.map((w) => [w.window, w.share, w.resets])).toEqual([
      ['5 Hour', '86%', '1h 44m'],
      ['7 Day', '94%', '5d 15h'],
    ])
    expect(sectionOf('google-antigravity').windows.map((w) => [w.window, w.share])).toEqual([
      ['5 Hour', '100%'],
      ['Weekly', '100%'],
    ])
  })

  test('a window names its worst status only when it is warning or exhausted', () => {
    expect(sectionOf('cursor').windows).toEqual([
      { window: 'Monthly', share: '0%', shareColor: '#e5484d', status: 'exhausted', resets: '11h 25m' },
    ])
    expect(sectionOf('anthropic').windows.map((w) => w.status)).toEqual([null, null])
  })

  test('before any fetch settles the model says it is fetching', () => {
    expect(quotaModelOf({ usage: null, failure: null, lastGoodAt: null }, NOW)).toEqual({
      notice: 'Fetching omp usage',
      providers: [],
    })
  })

  test('with no good fetch yet the model names the failure', () => {
    expect(quotaModelOf({ usage: null, failure: 'omp exited 1', lastGoodAt: null }, NOW)).toEqual({
      notice: 'Unavailable: omp exited 1',
      providers: [],
    })
  })

  test('a failure after good data keeps the data and says how old it is', () => {
    const model = quotaModelOf({ usage: fixtureUsage(), failure: 'omp did not answer', lastGoodAt: NOW - 720000 }, NOW)
    expect(model.notice).toBe('Stale: omp did not answer; showing data from 12m ago')
    expect(model.providers).toHaveLength(5)
  })

  test('a window with no share anywhere shows a dash and the first limit\'s reset', () => {
    const windows = windowsOf([limit('a', { resetsAt: NOW + 60000 }), limit('b')])
    expect(windows).toEqual([{ window: 'W', share: '—', shareColor: undefined, status: null, resets: '1m' }])
  })

  test('a limit without a window label is grouped under its own label', () => {
    expect(windowsOf([limit('a', { label: 'A', windowLabel: '' })]).map((w) => w.window)).toEqual(['A'])
  })

  test('a due reset reads now and a missing one reads a dash, listed last', () => {
    const windows = windowsOf([limit('a', { windowLabel: 'X' }), limit('b', { windowLabel: 'Y', resetsAt: NOW - 1 })])
    expect(windows.map((w) => [w.window, w.resets])).toEqual([
      ['Y', 'now'],
      ['X', '—'],
    ])
  })
})

describe('shareColorOf', () => {
  const RED = '#e5484d'
  const ORANGE = '#f5a524'
  const GREEN = '#46a758'

  test('0 to 30% left is red', () => {
    expect([0, 0.3].map(shareColorOf)).toEqual([RED, RED])
  })

  test('31 to 60% left is orange', () => {
    expect([0.31, 0.6].map(shareColorOf)).toEqual([ORANGE, ORANGE])
  })

  test('61 to 100% left is green', () => {
    expect([0.61, 1].map(shareColorOf)).toEqual([GREEN, GREEN])
  })

  test('no share has no color', () => {
    expect(shareColorOf(null)).toBeUndefined()
  })

  test('the color follows the rounded percentage shown', () => {
    expect(shareColorOf(0.305)).toBe(ORANGE)
    expect(shareColorOf(0.604)).toBe(ORANGE)
  })
})
