import { expect, test } from 'claude-code/testing'
import { CONFIG_PATH, pressKey, shown } from './fixtures/pane.ts'
import { AB, CONFIG, world } from './fixtures/world.ts'
import { workPrompt } from '../hooks/register.ts'

const A = 'pm/cc-plugins/tasks/a.md'
const B = 'pm/cc-plugins/tasks/b.md'
const BUILT_IN = workPrompt(A, 'obsidian')
const withPrompt = (text: string) => `${CONFIG}  work_prompt: ${text}\n`

function submits(on: any) {
  const texts: string[] = []
  on('prompt.submit', (_$: any, e: any) => {
    texts.push(e.text)
    return { text: e.text }
  })
  return texts
}

async function sent(on: any, $: any, config: string) {
  const texts = submits(on)
  const w = world(on, { query: AB, files: { [CONFIG_PATH]: config } })
  await shown($, w, 'a')
  await pressKey($, w, 'work')
  return texts
}

test('C3 the project value wins over the user value', { options: { work_prompt: 'user' } } as any, async ($, on) => {
  expect(await sent(on, $, withPrompt('project'))).toEqual(['project'])
})

test('C3 the user value wins over the built-in text', { options: { work_prompt: 'user' } } as any, async ($, on) => {
  expect(await sent(on, $, CONFIG)).toEqual(['user'])
})

test('C3 with neither value the built-in text is sent', async ($, on) => {
  expect(await sent(on, $, CONFIG)).toEqual([BUILT_IN])
})

test('C3 an empty project value falls through to the user value', { options: { work_prompt: 'user' } } as any, async ($, on) => {
  expect(await sent(on, $, withPrompt('""'))).toEqual(['user'])
})

test('C3 a whitespace project value falls through to the user value', { options: { work_prompt: 'user' } } as any, async ($, on) => {
  expect(await sent(on, $, withPrompt('"   "'))).toEqual(['user'])
})

test('C3 a whitespace user value falls through to the built-in text', { options: { work_prompt: '  \t ' } } as any, async ($, on) => {
  expect(await sent(on, $, CONFIG)).toEqual([BUILT_IN])
})

test('C4 {card} and {vault} are replaced everywhere they occur', async ($, on) => {
  expect(await sent(on, $, withPrompt('"{card} in {vault}; again {card} / {vault}"'))).toEqual([`${A} in obsidian; again ${A} / obsidian`])
})

test('C4 an unknown placeholder and other braces stay as written', async ($, on) => {
  expect(await sent(on, $, withPrompt('"{x} {card} {} {{vault}}"'))).toEqual([`{x} ${A} {} {obsidian}`])
})

test('C4 the user value is substituted too', { options: { work_prompt: 'U {card} {vault} {x}' } } as any, async ($, on) => {
  expect(await sent(on, $, CONFIG)).toEqual([`U ${A} obsidian {x}`])
})

test('C4 the built-in text is not substituted', async ($, on) => {
  expect(await sent(on, $, CONFIG)).toEqual([BUILT_IN])
})

test('C5 an edit of .obsidian.yaml between two /issue runs changes the sent text', async ($, on) => {
  const texts = submits(on)
  const w = world(on, { query: AB, files: { [CONFIG_PATH]: withPrompt('one {card}') } })
  await shown($, w, 'a')
  await pressKey($, w, 'work')
  w.files[CONFIG_PATH] = withPrompt('two {card}')
  await shown($, w, 'b')
  await pressKey($, w, 'work')
  expect(texts).toEqual([`one ${A}`, `two ${B}`])
})

test('C5 an edit after the card is shown and before the press applies', async ($, on) => {
  const texts = submits(on)
  const w = world(on, { query: AB, files: { [CONFIG_PATH]: withPrompt('one') } })
  await shown($, w, 'a')
  w.files[CONFIG_PATH] = withPrompt('two')
  await pressKey($, w, 'work')
  expect(texts).toEqual(['two'])
})

test('C5 an unreadable config at press time still sends the user value', { options: { work_prompt: 'user {card}' } } as any, async ($, on) => {
  const texts = submits(on)
  const w = world(on, { query: AB })
  await shown($, w, 'a')
  w.files[CONFIG_PATH] = { deny: 'EACCES' }
  await pressKey($, w, 'work')
  expect(texts).toEqual([`user ${A}`])
})

test('C5 an unreadable config at press time still sends the built-in text', async ($, on) => {
  const texts = submits(on)
  const w = world(on, { query: AB })
  await shown($, w, 'a')
  delete w.files[CONFIG_PATH]
  await pressKey($, w, 'work')
  expect(texts).toEqual([BUILT_IN])
})
