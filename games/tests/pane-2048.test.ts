import { describe, expect, test } from 'claude-code/testing'
import { paneProps, run, SESSION, world } from './fixtures/world.ts'

const PANE_PROPS = paneProps('2048')
const RUN = run('2048')

async function boardOf(ui: any): Promise<number[]> {
  const cells: number[] = []
  for (let r = 0; r < 4; r++) {
    const row = await ui.find({ key: `row:${r}` })
    cells.push(...row.text.trim().split(/\s+/).map((c: string) => (c === '·' ? 0 : Number(c))))
  }
  return cells
}

const sum = (cells: number[]) => cells.reduce((a, b) => a + b, 0)

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`/2048 on ${surface}`, () => {
    test('registers a command that runs mid-turn', async ($, on) => {
      const seen = world(on)
      await $.session.start(SESSION)
      expect(seen.commands).toContainEqual(expect.objectContaining({ name: '2048', immediate: true }))
    })

    test('opens a focused pane on a fresh board of two tiles', async ($, on) => {
      const seen = world(on)
      await $.session.start(SESSION)
      expect(await $.command.run(RUN)).toEqual({})
      expect(seen.opened).toEqual([expect.objectContaining({ id: '2048', focus: true })])
      const ui = await $.ui.mount({ plugin: 'games', surface, component: 'Pane', requestId: '2048', props: PANE_PROPS })
      const cells = await boardOf(ui)
      expect(cells).toHaveLength(16)
      expect(cells.filter((v) => v !== 0)).toHaveLength(2)
      expect((await ui.find({ key: 'score' }))?.text).toBe('Score 0   Best 0')
    })

    test('a move that slides adds one tile of 2 or 4; one that does not adds none', async ($, on) => {
      world(on)
      await $.session.start(SESSION)
      await $.command.run(RUN)
      const ui = await $.ui.mount({ plugin: 'games', surface, component: 'Pane', requestId: '2048', props: PANE_PROPS })
      let moved = 0
      for (const key of ['up', 'left', 'down', 'right', 'up', 'left']) {
        const before = sum(await boardOf(ui))
        await ui.press({ key })
        const gained = sum(await boardOf(ui)) - before
        expect([0, 2, 4]).toContain(gained)
        if (gained) moved += 1
      }
      expect(moved).toBeGreaterThan(0)
    })

    test('a second /2048 keeps the game; new starts over', async ($, on) => {
      world(on)
      await $.session.start(SESSION)
      await $.command.run(RUN)
      const ui = await $.ui.mount({ plugin: 'games', surface, component: 'Pane', requestId: '2048', props: PANE_PROPS })
      for (const key of ['up', 'left', 'down', 'right']) await ui.press({ key })
      const played = await boardOf(ui)
      await $.command.run(RUN)
      expect(await boardOf(ui)).toEqual(played)
      await ui.press({ key: 'new' })
      expect((await boardOf(ui)).filter((v) => v !== 0)).toHaveLength(2)
      expect((await ui.find({ key: 'score' }))?.text).toMatch(/^Score 0 /)
    })

    test('shows the best score the store remembers', async ($, on) => {
      world(on, { best2048: 512 })
      await $.session.start(SESSION)
      await $.command.run(RUN)
      const ui = await $.ui.mount({ plugin: 'games', surface, component: 'Pane', requestId: '2048', props: PANE_PROPS })
      expect((await ui.find({ key: 'score' }))?.text).toBe('Score 0   Best 512')
    })

    test('close closes the pane', async ($, on) => {
      const seen = world(on)
      await $.session.start(SESSION)
      await $.command.run(RUN)
      const ui = await $.ui.mount({ plugin: 'games', surface, component: 'Pane', requestId: '2048', props: PANE_PROPS })
      await ui.press({ key: 'close' })
      expect(seen.closed).toEqual([expect.objectContaining({ id: '2048' })])
    })
  })
}
