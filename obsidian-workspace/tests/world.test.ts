import { expect, test } from 'claude-code/testing'
import { PANE, issue, runsOf, stringsIn, viewSelect } from './fixtures/pane.ts'
import { CARD, SESSION, VIEW_NAMES, world } from './fixtures/world.ts'

test('rejects stale and misspelled world options', async ($, on) => { expect(() => world(on, { search: '[]' } as any)).toThrow('search'); expect(() => world(on, { qeury: '[]' } as any)).toThrow('qeury') })
test('accepts query and empty world options', async ($, on) => { expect(() => world(on, { query: '[]' })).not.toThrow(); expect(() => world(on, {})).not.toThrow() })
test('names the template dashboard views', () => expect(VIEW_NAMES).toEqual(['Active', 'Blocked', 'By Parent', 'Recently Completed', 'By Tag', 'Docs', 'All Tasks']))

test('answers the dashboard read from views even when reads names other paths', async ($, on) => {
  const w = world(on, { reads: { 'pm/cc-plugins/tasks/a.md': CARD } })
  await issue($, '')
  expect(runsOf(w, 'views')[0].argv[3]).toBe('path=pm/cc-plugins/dashboard.base')
  const strings = stringsIn(await $.ui.render(PANE))
  expect(strings).not.toContain('Error: File "pm/cc-plugins/dashboard.base" not found.')
  expect(viewSelect(await $.ui.render(PANE)).props.options.map((option: any) => option.value)).toEqual(VIEW_NAMES)
})

test('a slash name is not a card read', async ($, on) => {
  const w = world(on, {})
  await issue($, 'a/b')
  expect(runsOf(w, 'read')).toEqual([])
  expect(runsOf(w, 'views')).toHaveLength(1)
})

test('a hung dashboard read answers the template views after 60 s', async ($, on) => {
  const w = world(on, { views: 'hang' })
  await $.session.start(SESSION)
  const done = $.command.run({ command: 'issue', args: '' })
  await w.clock.settle()
  await w.clock.advance(60000)
  await done
  expect(viewSelect(await $.ui.render(PANE)).props.options.map((option: any) => option.value)).toEqual(VIEW_NAMES)
})
