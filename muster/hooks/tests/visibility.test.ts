import { expect, test } from 'claude-code/testing'
import { BAND, handlerOf } from './fixtures/band.ts'
import { BENEATH, NOW } from './fixtures/world.ts'

const ROW = { name: 'inline-help', state: 'running', title: 'Add a login form', plan: null, tools: 0, cost: null, seconds: 5 }
const next = async () => BENEATH
const handler = () => handlerOf('ui.render', { component: 'AbovePrompt' })

// The band's own $; `text` makes the Text the band draws with, and `board` may reject.
const fake = (options: { board?: unknown; boardRejects?: boolean; text?: (props: object) => unknown } = {}) => ({
  state: {
    get: async () => {
      if (options.boardRejects) throw new Error('state unavailable')
      return { value: options.board ?? null, version: 1 }
    },
  },
  clock: { now: async () => NOW },
  ui: {
    resolve: async () => ({
      Box: (props: object) => ({ type: 'Box', props }),
      Text: options.text ?? ((props: object) => ({ type: 'Text', props })),
    }),
  },
})

test('BandVisibility T1 a survey leaves the prompt area to the layers beneath', async () => {
  const result = await handler()(fake({ board: { rows: [ROW], collect: 0 } }), { ...BAND, props: { ...BAND.props, hasSurvey: true } }, next)
  expect(result).toEqual(BENEATH)
})

test('BandVisibility T2 no run of this repository in flight leaves the layers beneath alone', async () => {
  expect(await handler()(fake({ board: null }), BAND, next)).toEqual(BENEATH)
})

test('BandVisibility T3 a fault while drawing returns what the layers beneath drew, and a working draw is kept', async () => {
  const throwing = fake({
    board: { rows: [ROW], collect: 0 },
    text: () => {
      throw new Error('boom')
    },
  })
  expect(await handler()(throwing, BAND, next)).toEqual(BENEATH)
  const working = await handler()(fake({ board: { rows: [ROW], collect: 0 } }), BAND, next)
  expect(working.props.children.at(-1)).toEqual(BENEATH)
})

test('BandVisibility T4 an unreadable board returns what the layers beneath drew', async () => {
  expect(await handler()(fake({ boardRejects: true }), BAND, next)).toEqual(BENEATH)
})

test('BandVisibility T5 a non-empty board puts the band above the layers beneath', async () => {
  const tree = await handler()(fake({ board: { rows: [ROW], collect: 0 } }), BAND, next)
  expect(tree.props.children[0]).not.toEqual(BENEATH)
  expect(tree.props.children[1]).toEqual(BENEATH)
})
