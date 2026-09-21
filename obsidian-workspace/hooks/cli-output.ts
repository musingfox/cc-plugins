export type Run = { kind: 'exited'; exitCode: number; stdout: string; stderr: string } | { kind: 'rejected' }

export const OBSIDIAN_TIMEOUT_MS = 10_000

const NOT_RUN = `The obsidian CLI did not run: it is not on PATH, or it did not answer within ${OBSIDIAN_TIMEOUT_MS / 1000} s.`

// Anything that is not a known success shape is shown as the CLI printed it.
// The CLI prints its own errors on stdout with exit 0, so stdout is read first there;
// a non-zero exit is the shell's failure and its complaint is on stderr.
function errorMessage(run: Run) {
  if (run.kind === 'rejected') return NOT_RUN
  const [first, second] = run.exitCode === 0 ? [run.stdout, run.stderr] : [run.stderr, run.stdout]
  return first.trim() || second.trim() || `obsidian exited ${run.exitCode} with no output.`
}

type BaseRow = { path: string; status: string | null; priority: string | null }

export function baseQueryOutput(run: Run): { kind: 'rows'; rows: BaseRow[] } | { kind: 'empty' } | { kind: 'error'; message: string } {
  if (run.kind !== 'exited' || run.exitCode !== 0) return { kind: 'error', message: errorMessage(run) }
  try {
    const parsed = JSON.parse(run.stdout)
    if (!Array.isArray(parsed) || !parsed.every((row) => row && typeof row === 'object' && typeof row.path === 'string')) {
      return { kind: 'error', message: errorMessage(run) }
    }
    const rows = parsed.map((row) => ({ path: row.path, status: typeof row.status === 'string' ? row.status : null, priority: typeof row.priority === 'string' ? row.priority : null }))
    return rows.length ? { kind: 'rows', rows } : { kind: 'empty' }
  } catch {
    return { kind: 'error', message: errorMessage(run) }
  }
}

// A listing is one `name\ttype` per line; a line of any other shape is the CLI
// saying something else, which is shown rather than read as "this dashboard has no view".
// A listing that named views but none the pane could draw is shown the same way: only a
// dashboard that listed nothing at all is empty.
export function viewsOutput(run: Run): { kind: 'views'; views: string[] } | { kind: 'empty' } | { kind: 'error'; message: string } {
  if (run.kind !== 'exited' || run.exitCode !== 0) return { kind: 'error', message: errorMessage(run) }
  const lines = run.stdout.split('\n').filter((line) => line.trim() !== '')
  if (lines.some((line) => line.lastIndexOf('\t') < 1)) return { kind: 'error', message: errorMessage(run) }
  const views = lines.flatMap((line) => {
    const name = line.slice(0, line.lastIndexOf('\t'))
    return /^[^\x00-\x08\x0b-\x1f\x7f-\x9f\t\n\r]{1,10000}$/.test(name) ? [name] : []
  })
  if (views.length) return { kind: 'views', views }
  return lines.length ? { kind: 'error', message: errorMessage(run) } : { kind: 'empty' }
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
