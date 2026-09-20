import { describe, expect, test } from 'claude-code/testing'
import { PANE, headerIn, issue, nodesOf, stringsIn } from './fixtures/pane.ts'
import { RED, priorityColor, statusColor } from '../hooks/style.ts'
import { world } from './fixtures/world.ts'
describe('style helpers', () => { test('colours known values', () => { expect(statusColor('todo')).toBeTruthy(); expect(priorityColor('medium')).toBeTruthy() }) })
describe('pane style', () => {
  test('colours the card header and uses a body-width separator', async ($, on) => { world(on, { query: '[{"path":"pm/cc-plugins/tasks/k.md","status":"todo"}]', read: '---\nstatus: todo\npriority: medium\n---\nbody' }); await issue($, 'k'); const tree = await $.ui.render(PANE); expect(stringsIn(headerIn(tree)).join('')).toBe('status: todo · priority: medium'); expect(stringsIn(tree)).toContain('─'.repeat(80)) })
  test('draws query failures in red with a dim hint', async ($, on) => { world(on, { query: 'Vault not found.' }); await issue($, ''); const nodes = nodesOf(await $.ui.render(PANE), 'Text'); expect(nodes.some((x: any) => x.props.color === RED)).toBe(true); expect(nodes.some((x: any) => x.props.dimColor)).toBe(true) })
})
