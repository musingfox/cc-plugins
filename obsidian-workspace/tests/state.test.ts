import { describe, expect, test } from 'claude-code/testing'
import { PANE, buttonOf, headingKeys, issue, lineOf, nodesOf, pressKey, rowKeys, stringsIn, typeQuery, watchState } from './fixtures/pane.ts'
import { world } from './fixtures/world.ts'
import { MIX, P } from './fixtures/rows.ts'
import { rowKey, groupKey } from '../hooks/list.ts'
import { BACK_KEY } from '../hooks/ring.ts'

const mix = (on: any) => world(on, { query: JSON.stringify(MIX) })

describe('the pane lives in $.state', () => {
  test('a typed query is written to the list value', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await issue($, '')
    await typeQuery($, w, 'zz')
    expect(state.latest('list').query).toBe('zz')
  })

  test('the rows the pane draws are in the pane value', async ($, on) => {
    world(on)
    const state = watchState(on)
    await issue($, '')
    expect(JSON.stringify(state.latest('pane'))).toContain('pm/cc-plugins/tasks/a.md')
  })

  test('drawing the pane writes nothing and runs nothing', async ($, on) => {
    const w = mix(on)
    const state = watchState(on)
    await issue($, '')
    await w.clock.settle()
    const written = Object.values(state.writes).map((writes) => writes.length)
    const runs = w.runs.length
    for (let draws = 0; draws < 3; draws++) await $.ui.render(PANE)
    expect(Object.values(state.writes).map((writes) => writes.length)).toEqual(written)
    expect(w.runs.length).toBe(runs)
  })

  test('a card body of 200,000 characters crosses the state and draws with its clip notice', async ($, on) => {
    world(on, { read: `---\ntitle: t\n---\n${'x'.repeat(200000 - '---\ntitle: t\n---\n'.length)}` })
    await issue($, 'k')
    expect(stringsIn(await $.ui.render(PANE))).toContain('Clipped: showing 10000 of 199983 characters.')
  })

  test('every value written is JSON with no undefined and no array holes', async ($, on) => {
    const w = world(on, { read: '---\ntitle: m\n---\n# m\n\n```mermaid\ngraph LR\nA-->B\n```\n\ntail\n' })
    const state = watchState(on)
    await issue($, 'm')
    await w.clock.settle()
    for (const writes of Object.values(state.writes)) for (const value of writes) expect(value).toEqual(JSON.parse(JSON.stringify(value)))
  })
})

describe('a second /issue in one session', () => {
  test('keeps the filter and shows it in the Input with clear drawn', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await typeQuery($, w, 'b')
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(nodesOf(tree, 'Input')[0].props.value).toBe('b')
    expect(rowKeys(tree)).toEqual([rowKey(P('b'))])
    expect(buttonOf(tree, 'clear')).toBeDefined()
  })

  test('keeps the folded groups', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await pressKey($, w, groupKey(0, 'todo'))
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(rowKeys(tree)).not.toContain(rowKey(P('b')))
    expect(stringsIn(lineOf(tree, groupKey(0, 'todo')))[0]).toBe('▸ ')
  })

  test('keeps the sort', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await pressKey($, w, 'sort')
    await issue($, '')
    expect(buttonOf(await $.ui.render(PANE), 'sort').props.label).toBe('sort title')
  })

  test('closes an open card', async ($, on) => {
    const w = mix(on)
    await issue($, '')
    await pressKey($, w, rowKey(P('a')))
    await issue($, '')
    const tree = await $.ui.render(PANE)
    expect(headingKeys(tree).length).toBeGreaterThan(0)
    expect(buttonOf(tree, BACK_KEY)).toBeUndefined()
  })
})
