export type Run = { kind: 'exited'; exitCode: number; stdout: string; stderr: string } | { kind: 'rejected' }

export const OBSIDIAN_TIMEOUT_MS = 10_000

const NOT_RUN = `The obsidian CLI did not run: it is not on PATH, or it did not answer within ${OBSIDIAN_TIMEOUT_MS / 1000} s.`

// Anything that is not a known success shape is shown as the CLI printed it.
function errorMessage(run: Run) {
  if (run.kind === 'rejected') return NOT_RUN
  return run.stdout.trim() || run.stderr.trim() || `obsidian exited ${run.exitCode} with no output.`
}

type BaseRow = { path: string; status: string | null }

export function baseQueryOutput(run: Run): { kind: 'rows'; rows: BaseRow[] } | { kind: 'empty' } | { kind: 'error'; message: string } {
  if (run.kind !== 'exited' || run.exitCode !== 0) return { kind: 'error', message: errorMessage(run) }
  try {
    const parsed = JSON.parse(run.stdout)
    if (!Array.isArray(parsed) || !parsed.every((row) => row && typeof row === 'object' && typeof row.path === 'string')) {
      return { kind: 'error', message: errorMessage(run) }
    }
    const rows = parsed.map((row) => ({ path: row.path, status: typeof row.status === 'string' ? row.status : null }))
    return rows.length ? { kind: 'rows', rows } : { kind: 'empty' }
  } catch {
    return { kind: 'error', message: errorMessage(run) }
  }
}

export function viewsOutput(run: Run): string[] {
  if (run.kind !== 'exited' || run.exitCode !== 0) return []
  return run.stdout.split('\n').flatMap((line) => {
    const tab = line.lastIndexOf('\t')
    if (tab < 1) return []
    const name = line.slice(0, tab)
    return /^[^\x00-\x08\x0b-\x1f\x7f-\x9f\t\n\r]{1,10000}$/.test(name) ? [name] : []
  })
}

function noteOf(stdout: string): { frontmatter: string; body: string } | null {
  if (!stdout.startsWith('---\n')) return null
  const lines = stdout.split('\n')
  const close = lines.indexOf('---', 1)
  if (close < 0) return null
  return { frontmatter: lines.slice(1, close).join('\n'), body: lines.slice(close + 1).join('\n') }
}

export function readOutput(run: Run): { kind: 'card'; frontmatter: string; body: string } | { kind: 'error'; message: string } {
  const note = run.kind === 'exited' && run.exitCode === 0 ? noteOf(run.stdout) : null
  if (!note) return { kind: 'error', message: errorMessage(run) }
  return { kind: 'card', ...note }
}
