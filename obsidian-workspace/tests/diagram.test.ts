import { describe, expect, test } from 'claude-code/testing'
import { PANE, issue, nodesOf } from './fixtures/pane.ts'
import { MERMAID_CARD, world } from './fixtures/world.ts'
describe('diagram', () => {
  test('runs termaid for a mermaid card', async ($, on) => { const w = world(on, { query: '[{"path":"pm/cc-plugins/tasks/m.md"}]', read: MERMAID_CARD }); await issue($, 'm'); await w.clock.settle(); expect(w.runs.some((run: any) => run.argv[0] === 'uvx')).toBe(true); expect(nodesOf(await $.ui.render(PANE), 'Code')).toHaveLength(1) })
})
