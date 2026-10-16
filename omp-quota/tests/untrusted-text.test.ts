import { describe, expect, test } from 'claude-code/testing'
import { readUsage } from '../hooks/usage.ts'
import { BAND } from './fixtures/band.ts'
import { SNAPSHOT_STDOUT } from './fixtures/snapshot.ts'
import { SESSION, world } from './fixtures/world.ts'

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
