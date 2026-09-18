import { mock } from 'claude-code/testing'

export const NOW = 1789708507153

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

export function world(on: any) {
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  const clock = mock.clock(on, { now: NOW })
  return { clock }
}
