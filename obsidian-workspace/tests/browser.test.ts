import { describe, expect, test } from 'claude-code/testing'
import { PANE, issue, nodesOf, press, vizWorld } from './fixtures/pane.ts'
import { CARD } from './fixtures/world.ts'
describe('browser', () => {
  test('shows Open in browser for a shown card with viz', async ($, on) => { const w = vizWorld(on, { query: '[{"path":"pm/cc-plugins/tasks/mod-obw-issue-pane.md","status":"todo"}]' }); await issue($, 'mod-obw-issue-pane'); expect(nodesOf(await $.ui.render(PANE), 'Button').map(x => x.props.label)).toEqual(['Open in browser']); expect(w.runs).toHaveLength(3) })
  test('renders the path-derived browser target', async ($, on) => { const w = vizWorld(on, { query: '[{"path":"pm/cc-plugins/docs/a.md"}]', read: CARD }); await issue($, 'a'); await press($, w); expect(w.writes[0].path).toBe('/tmp/viz/obw/tasks-a.md') })
})
