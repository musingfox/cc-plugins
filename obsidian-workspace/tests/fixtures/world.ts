import { mock } from 'claude-code/testing'
export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
export const CARD = '---\ntitle: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\n---\n# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n'
type Answer = string | { exitCode: number; stdout: string; stderr: string } | { deny: string } | 'hang'
export function world(on: any, options: any = {}) {
  const runs: any[] = [], existsCalls: string[] = [], readCalls: string[] = [], opened: any[] = [], registered: any[] = []; let invalidates = 0
  const files = options.files ?? { '/work/.obsidian.yaml': 'vault: obsidian\npm:\n  project: cc-plugins\n' }; let answers: Answer[] = options.answers ?? ['["pm/cc-plugins/tasks/a.md"]']; const clock = mock.clock(on)
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: options.cwd ?? '/work' }))
  on('fs.exists', (_: any, e: any) => { const path = e.path ?? e.input?.path ?? e.args?.path ?? e; existsCalls.push(path); return { value: path in files } })
  on('fs.read', (_: any, e: any) => { const path = e.path ?? e.input?.path ?? e.args?.path ?? e; readCalls.push(path); const v = files[path]; return typeof v === 'object' ? v : v === undefined ? { deny: 'missing' } : { value: v } })
  on('command.register', (_: any, e: any) => { registered.push(e); return options.register ?? { value: {} } })
  on('ui.open', (_: any, e: any) => { opened.push(e); return options.open ?? { value: undefined } })
  on('ui.invalidate', () => { invalidates++; return { value: undefined } })
  on('process.run', async (_: any, e: any) => { runs.push(e); const answer = answers.length > 1 ? answers.shift()! : answers[0]; if (answer === 'hang') { await clock.sleep(60000); return { value: { exitCode: 0, stdout: '["pm/cc-plugins/tasks/a.md"]', stderr: '' } }; } if (typeof answer === 'string') return { value: { exitCode: 0, stdout: answer, stderr: '' } }; if ('deny' in answer) return answer; return { value: answer } })
  return { clock, runs, existsCalls, readCalls, opened, registered, get invalidates() { return invalidates } }
}
