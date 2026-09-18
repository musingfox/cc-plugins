import type { On } from 'claude-code'
import { readUsage } from './usage.ts'
import type { OmpOutcome, UsageReading } from './usage.ts'

const FETCH_ARGV = ['omp', 'usage', '--json']
const OMP_TIMEOUT_MS = 10_000

async function runOmp($: any, home: string, argv: string[]): Promise<OmpOutcome> {
  try {
    // No shell, so no `~`; and env can only override the PI_CODING_AGENT_DIR that
    // Claude Code's own settings pass down, never unset it.
    const result = await $.process.run(argv, {
      env: { PI_CODING_AGENT_DIR: `${home}/.omp/agent` },
      timeoutMs: OMP_TIMEOUT_MS,
    })
    return { kind: 'exited', exitCode: result.exitCode, stdout: result.stdout }
  } catch {
    return { kind: 'rejected' }
  }
}

async function fetchUsage($: any): Promise<UsageReading> {
  const home = await $.env.get('HOME')
  if (!home) return { ok: false, reason: 'HOME is unset' }
  return readUsage(await runOmp($, home, FETCH_ARGV))
}

async function fetchAndPublish($: any) {
  const reading = await fetchUsage($)
  if (!reading.ok) $.ui.status(`omp quota: unavailable (${reading.reason})`)
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    void fetchAndPublish($).catch(() => {})
    return next(e)
  })
}
