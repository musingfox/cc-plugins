import { mock } from 'claude-code/testing'
export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
export const CARD = '---\ntitle: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\n---\n# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n'
type Answer = string | { exitCode: number; stdout: string; stderr: string } | { deny: string } | 'hang'
let active: any
function reset(options: any) { return { options, runs: [], existsCalls: [], readCalls: [], opened: [], registered: [], invalidates: 0, files: options.files ?? { '/work/.obsidian.yaml': 'vault: obsidian\npm:\n  project: cc-plugins\n' }, answers: options.answers ?? ['["pm/cc-plugins/tasks/a.md"]'] as Answer[] } }
export function world(on: any, options: any = {}) {
  active = reset(options); const clock = mock.clock(on)
  on('session.start', (_: any, e: any) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: active.options.cwd ?? '/work' }))
  on('fs.exists', (_: any, e: any) => { const path = e.path ?? e.input?.path ?? e.args?.path ?? e; active.existsCalls.push(path); return { value: path in active.files } })
  on('fs.read', (_: any, e: any) => { const path = e.path ?? e.input?.path ?? e.args?.path ?? e; active.readCalls.push(path); const v = active.files[path]; return typeof v === 'object' ? v : v === undefined ? { deny: 'missing' } : { value: v } })
  on('command.register', (_: any, e: any) => { active.registered.push(e); return active.options.register ?? { value: {} } })
  on('ui.open', (_: any, e: any) => { active.opened.push(e); return active.options.open ?? { value: undefined } })
  on('ui.invalidate', () => { active.invalidates++; return { value: undefined } })
  on('process.run', async (_: any, e: any) => { active.runs.push(e); const answer = active.answers.length > 1 ? active.answers.shift() : active.answers[0]; if (answer === 'hang') { await clock.sleep(60000); return { value: { exitCode: 0, stdout: '["pm/cc-plugins/tasks/a.md"]', stderr: '' } } } if (typeof answer === 'string') return { value: { exitCode: 0, stdout: answer, stderr: '' } }; if ('deny' in answer) return answer; return { value: answer } })
  return { clock, get runs() { return active.runs }, get existsCalls() { return active.existsCalls }, get readCalls() { return active.readCalls }, get opened() { return active.opened }, get registered() { return active.registered }, get invalidates() { return active.invalidates } }
}
