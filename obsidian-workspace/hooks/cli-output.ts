import { cardNameProblem } from './argv.ts'
export type Run = { kind: 'exited'; exitCode: number; stdout: string; stderr: string } | { kind: 'rejected' }
const rejected = 'The obsidian CLI did not run: it is not on PATH, or it did not answer within 10 s.'
function error(run: Run) { if (run.kind === 'rejected') return rejected; const message = (run.stdout.trim() || run.stderr.trim() || `obsidian exited ${run.exitCode} with no output.`); return message }
export function searchOutput(run: Run, project: string): { kind: 'cards'; cards: string[] } | { kind: 'empty' } | { kind: 'error'; message: string } {
  if (run.kind !== 'exited' || run.exitCode !== 0) return { kind: 'error', message: error(run) }
  const text = run.stdout.trim(); if (text === 'No matches found.') return { kind: 'empty' }
  try { const parsed = JSON.parse(text); if (!Array.isArray(parsed) || !parsed.every(x => typeof x === 'string')) throw Error(); const prefix = `pm/${project}/tasks/`; const cards = [...new Set(parsed.filter(x => x.startsWith(prefix) && x.endsWith('.md')).map(x => x.slice(prefix.length, -3)).filter(x => !cardNameProblem(x)))]; return cards.length ? { kind: 'cards', cards } : { kind: 'empty' } } catch { return { kind: 'error', message: error(run) } }
}
export function readOutput(run: Run): { kind: 'card'; frontmatter: string; body: string } | { kind: 'error'; message: string } {
  if (run.kind !== 'exited' || run.exitCode !== 0) return { kind: 'error', message: error(run) }; if (!run.stdout.startsWith('---\n')) return { kind: 'error', message: error(run) }
  const at = run.stdout.indexOf('---\n', 4); if (at < 0) return { kind: 'error', message: error(run) }; return { kind: 'card', frontmatter: run.stdout.slice(4, at), body: run.stdout.slice(at + 4) }
}
