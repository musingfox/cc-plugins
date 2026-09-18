import { mock } from 'claude-code/testing'
import { SNAPSHOT_STDOUT } from './snapshot.ts'

export const NOW = 1789708507153

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

export const FIXTURE = { exitCode: 0, stdout: SNAPSHOT_STDOUT, stderr: '' }

export type OmpAnswer = { exitCode: number; stdout?: string; stderr?: string } | { deny: string } | 'hang'

type Hook = (...args: any[]) => unknown

export type WorldOptions = {
  env?: Record<string, string>
  commandRegister?: Hook
  uiOpen?: Hook
}

// A stub world beneath the plugin: every $ call it makes is answered and recorded here.
// `omp` answers `omp usage --json` runs in order, the last one repeating; `invalidate`
// answers `omp usage invalidate`.
export function world(on: any, options: WorldOptions = {}) {
  const runs: any[] = []
  const statuses: string[] = []
  const toasts: string[] = []
  const opened: any[] = []
  const registered: any[] = []
  const state = { invalidates: 0, omp: [FIXTURE] as OmpAnswer[], invalidate: { exitCode: 0 } as OmpAnswer }

  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, options.env ?? { HOME: '/home/u' })
  on(
    'command.register',
    options.commandRegister ??
      (($: any, e: any) => {
        registered.push(e)
        return { value: { command: e.name } }
      }),
  )
  on('process.run', async ($: any, e: any) => {
    runs.push(e)
    const answer = e.argv[2] === 'invalidate' ? state.invalidate : state.omp.length > 1 ? state.omp.shift()! : state.omp[0]!
    if (answer === 'hang') {
      await clock.sleep(60000)
      return { value: FIXTURE }
    }
    if ('deny' in answer) return { deny: answer.deny }
    return { value: { stdout: '', stderr: '', ...answer } }
  })
  on('ui.status', ($: any, e: any) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on(
    'ui.open',
    options.uiOpen ??
      (($: any, e: any) => {
        opened.push(e)
        return { value: undefined }
      }),
  )
  on('ui.invalidate', () => {
    state.invalidates += 1
    return { value: undefined }
  })

  return {
    clock,
    runs,
    statuses,
    toasts,
    opened,
    registered,
    jsonRuns: () => runs.filter((r) => r.argv[2] === '--json').length,
    get invalidates() {
      return state.invalidates
    },
    omp(...answers: OmpAnswer[]) {
      state.omp = answers
    },
    invalidateAnswers(answer: OmpAnswer) {
      state.invalidate = answer
    },
  }
}
