import { describe, expect, test } from 'claude-code/testing'
import { batchPrompt } from '../hooks/prompt.ts'
import type { Source } from '../types'

const spec: Source = { path: 'docs/spec/cards.md', type: 'spec', text: 'Never skip the gate.', hash: 'h1', completed: null }
const task: Source = { path: 'pm/cc-plugins/tasks/done.md', type: 'task', text: 'Built the review pane.', hash: 'h2', completed: '2026-10-01' }
const adr: Source = { path: 'docs/decisions/0001-use-store.md', type: 'adr', text: 'We chose the store.', hash: 'h3', completed: null }

// The delimited block that carries one source, from its header line to the next block's header or the end.
function blockOf(prompt: string, path: string) {
  const start = prompt.indexOf(`path="${path}"`)
  const rest = prompt.slice(start)
  const next = rest.indexOf('=== SOURCE', 1)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('batchPrompt', () => {
  test('carries every source once, in input order, with its path and text', () => {
    const prompt = batchPrompt([spec, task])
    expect(prompt).toContain('docs/spec/cards.md')
    expect(prompt).toContain('pm/cc-plugins/tasks/done.md')
    expect(prompt).toContain('Never skip the gate.')
    expect(prompt).toContain('Built the review pane.')
    expect(prompt.indexOf('docs/spec/cards.md')).toBeLessThan(prompt.indexOf('pm/cc-plugins/tasks/done.md'))
    expect(prompt.split('=== SOURCE').length - 1).toBe(2)
  })

  test('keeps the output and no-tool rules, and never names the file variables', () => {
    const prompt = batchPrompt([spec, task, adr])
    const lower = prompt.toLowerCase()
    for (const phrase of ['traditional chinese', 'verbatim', '1 to 3', 'json array', 'no tools']) expect(lower).toContain(phrase)
    expect(prompt).not.toContain('OUT_FILE')
    expect(prompt).not.toContain('SRC_DIR')
  })

  test('each block allows only the kinds its source type takes', () => {
    const prompt = batchPrompt([spec, adr, task])
    expect(blockOf(prompt, spec.path)).toContain('kinds="rule"')
    expect(blockOf(prompt, adr.path)).toContain('kinds="why"')
    expect(blockOf(prompt, task.path)).toMatch(/kinds="why(, | or |\/)what-for"|kinds="what-for(, | or |\/)why"/)
  })
})
