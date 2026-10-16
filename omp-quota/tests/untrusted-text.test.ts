import { describe, expect, test } from 'claude-code/testing'
import { readUsage } from '../hooks/usage.ts'
import { BAND } from './fixtures/band.ts'
import { SNAPSHOT_STDOUT } from './fixtures/snapshot.ts'
import { SESSION, world } from './fixtures/world.ts'

const CONTROL = /[\n\r\t\u0000-\u0008\u000b-\u001f\u007f-\u009f]/

function stringsIn(node: any): string[] {
  if (typeof node === 'string') return [node]
  if (!node || typeof node !== 'object') return []
  return [...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(stringsIn)
}

function rowsOf(tree: any): any[] {
  return (tree.props?.children ?? tree.children).filter(
    (row: any) => !(row?.type === 'Box' && !(row.children ?? row.props?.children)?.length),
  )
}

function linesOf(tree: any): string[] {
  return rowsOf(tree).map((line: any) => stringsIn(line).join(''))
}

// The fixture answer after `edit` changes a copy of its reports; the copy is fresh per call.
function answer(edit: (reports: any[]) => void = () => {}) {
  const copy = JSON.parse(SNAPSHOT_STDOUT)
  edit(copy.reports)
  return { exitCode: 0, stdout: JSON.stringify(copy), stderr: '' }
}

function usageOf(stdout: string) {
  const reading = readUsage({ kind: 'exited', exitCode: 0, stdout })
  if (!reading.ok) throw new Error(reading.reason)
  return reading.usage
}

function limitOf(stdout: string, id: string) {
  for (const provider of usageOf(stdout).providers) {
    const limit = provider.limits.find((l) => l.id === id)
    if (limit) return limit
  }
  throw new Error(`no limit ${id}`)
}

const CODEX_SECONDARY = 'openai-codex:secondary'
const CODEX_PRIMARY = 'openai-codex:primary'

describe('limit and window labels', () => {
  test('a window label with a newline draws as one line', () => {
    const stdout = answer((reports) => {
      reports[0].limits[1].window.label = 'Weekly\n7d'
    }).stdout
    expect(limitOf(stdout, CODEX_SECONDARY).windowLabel).toBe('Weekly 7d')
  })

  test('control-only labels clean to empty, so the limit label is drawn instead', () => {
    const stdout = answer((reports) => {
      reports[0].limits[0].label = 'Pro\u0007'
      reports[0].limits[0].window.label = '\u0007'
    }).stdout
    const limit = limitOf(stdout, CODEX_PRIMARY)
    expect(limit.label).toBe('Pro')
    expect(limit.windowLabel).toBe('')
  })

  test('the window cell draws the cleaned limit label when the window label is empty', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(
      answer((reports) => {
        reports[0].limits[0].label = 'Pro\u0007'
        reports[0].limits[0].window.label = '\u0007'
      }),
    )
    await $.session.start(SESSION)
    await w.clock.settle()
    const drawn = stringsIn(await $.ui.render(BAND)).join('')
    expect(drawn).toContain('Pro ')
    expect(drawn).not.toContain('\u0007')
  })

  test('a window label longer than 1000 units draws clipped with an ellipsis', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(
      answer((reports) => {
        reports[0].limits[1].window.label = 'W'.repeat(11000) + '\r'
      }),
    )
    await $.session.start(SESSION)
    await w.clock.settle()
    const drawn = stringsIn(await $.ui.render(BAND))
    expect(drawn.join('')).toContain('W'.repeat(999) + '…')
    expect(drawn.join('')).not.toContain('W'.repeat(1000))
    for (const s of drawn) expect(s.length).toBeLessThanOrEqual(10000)
  })
})

describe('provider names', () => {
  test('a provider name with a newline draws as one line', () => {
    const stdout = answer((reports) => {
      reports[0].provider = 'anthropic\nopenai'
    }).stdout
    expect(usageOf(stdout).providers[0]!.provider).toBe('anthropic openai')
  })

  test('reports whose cleaned names match merge into one provider with all their limits', () => {
    const stdout = JSON.stringify({
      reports: [
        { provider: 'a\n', limits: [{ id: 'L1' }] },
        { provider: 'a', limits: [{ id: 'L2' }] },
      ],
    })
    const providers = usageOf(stdout).providers
    expect(providers.map((p) => p.provider)).toEqual(['a'])
    expect(providers[0]!.limits.map((l) => l.id)).toEqual(['L1', 'L2'])
  })

  test('a provider name that is control characters only draws as (unnamed)', () => {
    const stdout = answer((reports) => {
      reports[0].provider = '\u0007'
    }).stdout
    expect(usageOf(stdout).providers[0]!.provider).toBe('(unnamed)')
  })

  test('the band draws a provider name with a newline as one clean line', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(
      answer((reports) => {
        reports[0].provider = 'anthropic\nopenai'
      }),
    )
    await $.session.start(SESSION)
    await w.clock.settle()
    const drawn = stringsIn(await $.ui.render(BAND))
    expect(drawn.join('')).toContain('anthropic openai')
    for (const s of drawn) expect(CONTROL.test(s)).toBe(false)
  })

  test('the band draws a long provider name clipped to 1000 units', async ($, on) => {
    const w = world(on, { store: { band: true } })
    w.omp(
      answer((reports) => {
        reports[0].provider = 'P'.repeat(11000) + '\r'
      }),
    )
    await $.session.start(SESSION)
    await w.clock.settle()
    const drawn = stringsIn(await $.ui.render(BAND))
    expect(drawn.join('')).toContain('P'.repeat(999) + '…')
    expect(drawn.join('')).not.toContain('P'.repeat(1000))
    for (const s of drawn) expect(s.length).toBeLessThanOrEqual(10000)
  })

  test('the worsening toast names a provider with a newline as one line', async ($, on) => {
    const w = world(on)
    w.omp(
      answer((reports) => {
        reports[0].provider = 'p\nq'
        for (const r of reports) for (const l of r.limits) l.status = 'ok'
      }),
      answer((reports) => {
        reports[0].provider = 'p\nq'
        for (const r of reports) for (const l of r.limits) l.status = 'ok'
        for (const l of reports[0].limits) l.status = 'warning'
      }),
    )
    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(300000)
    expect(w.toasts).toHaveLength(1)
    expect(w.toasts[0]).toContain('p q')
    expect(w.toasts[0]).not.toContain('\n')
  })
})
