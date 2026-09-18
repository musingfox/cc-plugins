import { expect, test } from 'claude-code/testing'
import { world, SESSION } from './fixtures/world.ts'
import { PANE } from './fixtures/pane.ts'
function strings(node: any): string[] { if (typeof node === 'string') return [node]; if (!node || typeof node !== 'object') return []; return [...(node.children ?? []), ...(node.props?.children ?? []), node.props?.text ?? ''].flatMap(strings) }
test('registers and opens an issue pane', async ($, on) => { const w = world(on); expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' }); expect(w.registered[0]).toEqual({ name: 'issue', description: 'Show an obw task card in a pane', argumentHint: '[card]', immediate: true }); expect(await $.command.run({ command: 'issue', args: '' })).toEqual({}); expect(w.opened[0]).toEqual({ id: 'obw-issue', title: 'obw issue', focus: true, closeOnEscape: true }) })
test('refuses unsafe names before reading config', async ($, on) => { const w = world(on); await $.command.run({ command: 'issue', args: 'a/b' }); expect(w.runs).toEqual([]); expect(w.existsCalls).toEqual([]); expect(strings(await $.ui.render(PANE))).toContain('"a/b" is not a card name.') })
