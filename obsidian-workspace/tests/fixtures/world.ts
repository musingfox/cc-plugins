import { mock } from 'claude-code/testing'
export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
export const CARD = '---\ntitle: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\n---\n# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n'
export function world(on: any, options: any = {}) {
  const runs: any[] = [], existsCalls: string[] = [], readCalls: string[] = [], opened: any[] = [], registered: any[] = []; let invalidates = 0
  const files = options.files ?? { '/work/.obsidian.yaml': 'vault: obsidian\npm:\n  project: cc-plugins\n' }; const answers = options.answers ?? ['["pm/cc-plugins/tasks/a.md"]']
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd })); mock.clock(on)
  on('session.cwd', () => ({ value: options.cwd ?? '/work' }))
  on('fs.exists', (_: any, e: any) => { const path = e.path ?? e.input?.path ?? e.args?.path ?? e; existsCalls.push(path); return { value: path in files } })
  on('fs.read', (_: any, e: any) => { const path = e.path ?? e.input?.path ?? e.args?.path ?? e; readCalls.push(path); const v = files[path]; return typeof v === 'object' ? v : v === undefined ? { deny: 'missing' } : { value: v } })
  on('command.register', (_: any, e: any) => { registered.push(e); return options.register ?? { value: {} } })
  on('ui.open', (_: any, e: any) => { opened.push(e); return options.open ?? { value: undefined } })
  on('ui.invalidate', () => { invalidates++; return { value: undefined } })
  on('process.run', (_: any, e: any) => { runs.push(e); const answer = answers.length > 1 ? answers.shift() : answers[0]; if (typeof answer === 'object') return 'deny' in answer ? answer : { value: answer }; return { value: { exitCode: 0, stdout: answer, stderr: '' } } })
  return { runs, existsCalls, readCalls, opened, registered, get invalidates() { return invalidates } }
}
