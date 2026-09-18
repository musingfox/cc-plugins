import { expect, test } from 'claude-code/testing'
import { world, SESSION } from './fixtures/world.ts'
import { PANE } from './fixtures/pane.ts'
const SEARCH = ['obsidian', 'vault=obsidian', 'search', 'query=[type:task] [project:cc-plugins] -[status:done]', 'path=pm/cc-plugins', 'format=json']
function strings(node: any): string[] { if (typeof node === 'string') return [node]; if (!node || typeof node !== 'object') return []; return [...(node.children ?? []), ...(node.props?.children ?? []), node.props?.text ?? '', ...(node.props?.options ?? []).flatMap((o: any) => [o.value, o.label])].flatMap(strings) }
function nodes(node: any, type: string): any[] { if (!node || typeof node !== 'object') return []; return [(node.type === type ? node : null), ...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(n => n ? nodes(n, type) : []).filter(Boolean) }
test('registers the issue command at session start', async ($, on) => { const w = world(on); expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' }); expect(w.registered[0]).toEqual({ name: 'issue', description: 'Show an obw task card in a pane', argumentHint: '[card]', immediate: true }) })
test('continues session start after registration refusal', async ($, on) => { world(on, { register: { deny: 'taken' } }); expect(await $.session.start(SESSION)).toEqual({ cwd: '/work' }) })
test('opens the issue pane', async ($, on) => { const w = world(on); await $.command.run({ command: 'issue', args: '' }); expect(w.opened[0]).toEqual({ id: 'obw-issue', title: 'obw issue', focus: true, closeOnEscape: true }) })
test('reports a refused pane without reading', async ($, on) => { const w = world(on, { open: { deny: 'no' } }); expect(await $.command.run({ command: 'issue', args: '' })).toEqual({ text: 'obw: the /issue pane could not open.' }); expect(w.runs).toEqual([]); expect(w.existsCalls).toEqual([]); expect(w.readCalls).toEqual([]) })
test('returns no list content', async ($, on) => { world(on); expect(await $.command.run({ command: 'issue', args: '' })).toEqual({}) })
test('returns no card content', async ($, on) => { const w = world(on, { answers: ['["pm/cc-plugins/tasks/mod-obw-issue-pane.md"]', '---\n---\nAcceptance Criteria'] }); const result = await $.command.run({ command: 'issue', args: 'mod-obw-issue-pane' }); expect(result).toEqual({}); expect(JSON.stringify(result).includes('Acceptance Criteria')).toBe(false) })
test('returns nothing on search error', async ($, on) => { world(on, { answers: ['Vault not found.'] }); expect(await $.command.run({ command: 'issue', args: '' })).toEqual({}) })
