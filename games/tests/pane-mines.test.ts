import { describe, expect, test } from 'claude-code/testing'
import { paneProps, run, SESSION, world } from './fixtures/world.ts'

const PANE_PROPS = paneProps('Minesweeper')
const RUN = run('mines')

// Each cell draws as a space and one glyph; the cursor's cell is drawn inverse.
async function gridOf(ui: any): Promise<{ glyphs: string[]; cursor: number }> {
  const glyphs: string[] = []
  let cursor = -1
  for (let r = 0; r < 9; r++) {
    const row = await ui.find({ key: `row:${r}` })
    row.children.forEach((cell: any, c: number) => {
      glyphs.push(cell.children.join('').slice(1))
      if (cell.props.inverse) cursor = r * 9 + c
    })
  }
  return { glyphs, cursor }
}

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`/mines on ${surface}`, () => {
    async function opened($: any, on: any) {
      const seen = world(on)
      await $.session.start(SESSION)
      expect(await $.command.run(RUN)).toEqual({})
      const ui = await $.ui.mount({ plugin: 'games', surface, component: 'Pane', requestId: 'mines', props: PANE_PROPS })
      return { seen, ui }
    }

    test('registers a command that runs mid-turn', async ($, on) => {
      const seen = world(on)
      await $.session.start(SESSION)
      expect(seen.commands).toContainEqual(expect.objectContaining({ name: 'mines', immediate: true }))
    })

    test('opens a focused pane on a hidden 9x9 board, cursor in the middle', async ($, on) => {
      const { seen, ui } = await opened($, on)
      expect(seen.opened).toEqual([expect.objectContaining({ id: 'mines', focus: true })])
      const grid = await gridOf(ui)
      expect(grid.glyphs).toEqual(Array(81).fill('.'))
      expect(grid.cursor).toBe(40)
      expect((await ui.find({ key: 'count' }))?.text).toBe('Mines 10')
    })

    test('the moves walk the cursor', async ($, on) => {
      const { ui } = await opened($, on)
      await ui.press({ key: 'up' })
      await ui.press({ key: 'left' })
      expect((await gridOf(ui)).cursor).toBe(30)
      await ui.press({ key: 'down' })
      await ui.press({ key: 'right' })
      expect((await gridOf(ui)).cursor).toBe(40)
    })

    test('flag marks the cell and counts it off', async ($, on) => {
      const { ui } = await opened($, on)
      await ui.press({ key: 'flag' })
      expect((await gridOf(ui)).glyphs[40]).toBe('F')
      expect((await ui.find({ key: 'count' }))?.text).toBe('Mines 9')
    })

    test('the first dig opens the board without losing', async ($, on) => {
      const { ui } = await opened($, on)
      await ui.press({ key: 'dig' })
      const grid = await gridOf(ui)
      expect(grid.glyphs[40]).not.toBe('.')
      expect(grid.glyphs).not.toContain('*')
      expect(grid.glyphs.filter((g) => g !== '.').length).toBeGreaterThan(1)
    })

    test('new starts over; close closes the pane', async ($, on) => {
      const { seen, ui } = await opened($, on)
      await ui.press({ key: 'dig' })
      await ui.press({ key: 'new' })
      expect((await gridOf(ui)).glyphs).toEqual(Array(81).fill('.'))
      await ui.press({ key: 'close' })
      expect(seen.closed).toEqual([expect.objectContaining({ id: 'mines' })])
    })
  })
}
