import { mock } from 'claude-code/testing'
import { SNAPSHOT_STDOUT } from './snapshot.ts'

export const NOW = 1789708507153

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

export const FIXTURE = { exitCode: 0, stdout: SNAPSHOT_STDOUT, stderr: '' }

// The fixture answer with some limits' status replaced (undefined removes the key).
export function fixtureWith(statuses: Record<string, string | undefined>) {
  const copy = JSON.parse(SNAPSHOT_STDOUT)
  for (const report of copy.reports)
    for (const limit of report.limits)
      if (limit.id in statuses) {
        if (statuses[limit.id] === undefined) delete limit.status
        else limit.status = statuses[limit.id]
      }
  return { exitCode: 0, stdout: JSON.stringify(copy), stderr: '' }
}

export type OmpAnswer = { exitCode: number; stdout?: string; stderr?: string } | { deny: string } | 'hang'

type Hook = (...args: any[]) => unknown

export type WorldOptions = {
  env?: Record<string, string>
  commandRegister?: Hook
  store?: Record<string, unknown> | 'refuse'
}

// A stub world beneath the plugin: every $ call it makes is answered and recorded here.
// `omp` answers `omp usage --json` runs in order, the last one repeating; `invalidate`
// answers `omp usage invalidate`.
export function world(on: any, options: WorldOptions = {}) {
  const runs: any[] = []
  const statuses: string[] = []
  const toasts: string[] = []
  const registered: any[] = []
  const state = { invalidates: 0, omp: [FIXTURE] as OmpAnswer[], invalidate: { exitCode: 0 } as OmpAnswer }

  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, options.env ?? { HOME: '/home/u' })
  if (options.store === 'refuse') {
    for (const call of ['store.get', 'store.set']) on(call, () => ({ deny: 'store unavailable' }))
  } else {
    mock.store(on, options.store ?? {})
  }
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
  on('ui.invalidate', () => {
    state.invalidates += 1
    return { value: undefined }
  })

  return {
    clock,
    runs,
    statuses,
    toasts,
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
