import { describe, expect, test } from 'claude-code/testing'
import { paneProps, run, SESSION, world } from './fixtures/world.ts'

const PANE_PROPS = paneProps('Dino')
const RUN = run('dino')

for (const surface of ['terminal', 'desktop'] as const) {
  describe(`/dino on ${surface}`, () => {
    async function opened($: any, on: any, store: Record<string, unknown> = {}) {
      const seen = world(on, store)
      await $.session.start(SESSION)
      expect(await $.command.run(RUN)).toEqual({})
      const ui = await $.ui.mount({ plugin: 'games', surface, component: 'Pane', requestId: 'dino', props: PANE_PROPS })
      await ui.resize({ columns: 40, rows: 8, in: 'dino' })
      return { seen, ui }
    }

    const scoreText = async (ui: any) => (await ui.find({ key: 'score', in: 'dino' }))?.text

    test('registers a command that runs mid-turn and opens a focused pane', async ($, on) => {
      const { seen } = await opened($, on)
      expect(seen.commands).toContainEqual(expect.objectContaining({ name: 'dino', immediate: true }))
      expect(seen.opened).toEqual([expect.objectContaining({ id: 'dino', focus: true })])
    })

    test('waits for a key before running', async ($, on) => {
      const { ui } = await opened($, on)
      await ui.advance(2000)
      expect(await scoreText(ui)).toBe('Score 0   Best 0')
      expect(await ui.find({ text: /space or ↑ to start/, in: 'dino' })).toBeDefined()
    })

    test('space starts the run and the score climbs with time', async ($, on) => {
      const { ui } = await opened($, on)
      await ui.key({ key: ' ', in: 'dino' })
      await ui.advance(500)
      expect(await scoreText(ui)).toMatch(/^Score [1-9]/)
    })

    test('a run left alone crashes and its score becomes the best', async ($, on) => {
      const { ui } = await opened($, on)
      await ui.key({ key: 'up', in: 'dino' })
      await ui.advance(60000)
      expect(await ui.find({ text: /Crashed/, in: 'dino' })).toBeDefined()
      const [, score, top] = (await scoreText(ui)).match(/^Score (\d+) {3}Best (\d+)$/)
      expect(Number(score)).toBeGreaterThan(0)
      expect(top).toBe(score)
    })

    test('shows the best score the store remembers', async ($, on) => {
      const { ui } = await opened($, on, { bestDino: 321 })
      expect(await scoreText(ui)).toBe('Score 0   Best 321')
    })

    test('close closes the pane', async ($, on) => {
      const { seen, ui } = await opened($, on)
      await ui.press({ key: 'close' })
      expect(seen.closed).toEqual([expect.objectContaining({ id: 'dino' })])
    })
  })
}
