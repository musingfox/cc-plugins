import { describe, expect, test } from 'claude-code/testing'
import { PANE, issue, runsOf, viewSelect } from './fixtures/pane.ts'
import { ALL_TASKS_ARGV, DASHBOARD_ARGV, VIEW_NAMES, world } from './fixtures/world.ts'
import { MIX } from './grouped.test.ts'

const P = (name: string) => `pm/cc-plugins/tasks/${name}.md`
const readArgv = (path: string) => ['obsidian', 'vault=obsidian', 'read', `path=${path}`]

describe('default view', () => {
  test('/issue opens All Tasks with one query', async ($, on) => {
    const w = world(on)
    await issue($, '')
    expect(w.runs.map((run: any) => run.argv)).toEqual([DASHBOARD_ARGV, ALL_TASKS_ARGV])
    for (const run of w.runs) expect(run.init.timeoutMs).toBe(10000)
    const tree = await $.ui.render(PANE)
    expect(viewSelect(tree).props.value).toBe('All Tasks')
    expect(viewSelect(tree).props.options).toEqual(VIEW_NAMES.map((name) => ({ value: name, label: name })))
  })

  test('a failed listing falls back to Active', async ($, on) => {
    const w = world(on, { views: { deny: 'no' } })
    await issue($, '')
    expect(runsOf(w, 'base:query')[0].argv).toContain('view=Active')
  })

  test('/issue <card> queries All Tasks then reads the card', async ($, on) => {
    const w = world(on, { query: JSON.stringify(MIX) })
    await issue($, 'a')
    expect(w.runs.map((run: any) => run.argv)).toEqual([DASHBOARD_ARGV, ALL_TASKS_ARGV, readArgv(P('a'))])
  })
})
