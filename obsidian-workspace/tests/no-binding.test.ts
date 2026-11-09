import { expect, test } from 'claude-code/testing'
import { SESSION, world } from './fixtures/world.ts'

const SET_IN_PROGRESS = 'obsidian vault=obsidian property:set name=status value=in-progress path="pm/cc-plugins/tasks/a.md" | cat'
const answer = { result: { stdout: 'Set status: in-progress\n', stderr: '', interrupted: false }, text: 'Set status: in-progress\n' }

test('NB1 a Bash call confirming in-progress writes no file and runs no rm', async ($, on) => {
  const w = world(on, { env: { HOME: '/Users/u' }, sessionId: 'sid-1' })
  on('tool.call', { tool: 'Bash' }, () => answer)
  await $.session.start(SESSION)
  await w.clock.settle()
  const result = await $.tool.call({ tool: 'Bash', command: SET_IN_PROGRESS })
  await w.clock.settle()
  expect(result).toEqual(answer)
  expect(w.writes).toEqual([])
  expect(w.runs.filter((run: any) => run.argv[0] === 'rm')).toEqual([])
})

test('NB2 session.start reads nothing under .claude-mobile', async ($, on) => {
  const w = world(on, { env: { HOME: '/Users/u', OBW_LAUNCHES_DIR: '/alt' }, sessionId: 'sid-1', files: { '/Users/u/.claude-mobile/launches/sid-1.json': '{"cardPath":"pm/cc-plugins/tasks/a.md","vault":"obsidian"}', '/alt/sid-1.json': '{}' } })
  await $.session.start(SESSION)
  await w.clock.settle()
  expect([...w.existsCalls, ...w.readCalls].filter((path: string) => path.includes('.claude-mobile') || path.startsWith('/alt'))).toEqual([])
  expect(w.runs).toEqual([])
})
