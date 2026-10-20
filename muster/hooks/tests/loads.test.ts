import { expect, test } from 'claude-code/testing'

test('the muster hooks module loads and session.start resolves', async ($, on) => {
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  expect(await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })).toBeDefined()
})
