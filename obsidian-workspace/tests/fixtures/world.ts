import { mock } from 'claude-code/testing'

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

export const CARD =
  '---\ntitle: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\ndue:\ntags:\n  - claude-mods\ncreated: 2026-09-18\n---\n# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n'

export const SEARCH_ARGV = [
  'obsidian',
  'vault=obsidian',
  'search',
  'query=[type:task] [project:cc-plugins] -[status:done]',
  'path=pm/cc-plugins',
  'format=json',
]

const LIST = '["pm/cc-plugins/tasks/a.md"]'

// A string is stdout with exit 0; 'hang' answers the default after 60 s on the mock clock.
export type CliAnswer = string | { exitCode: number; stdout?: string; stderr?: string } | { deny: string } | 'hang'

export type WorldOptions = {
  cwd?: string
  files?: Record<string, string | { deny: string }>
  exists?: { deny: string }
  search?: CliAnswer
  read?: CliAnswer
  register?: { deny: string }
  open?: { deny: string }
}

// A stub world beneath the plugin: every $ call it makes is answered and recorded here.
// `obsidian … search` and `obsidian … read` runs are answered by `search` and `read`.
export function world(on: any, options: WorldOptions = {}) {
  const runs: any[] = []
  const existsCalls: string[] = []
  const readCalls: string[] = []
  const opened: any[] = []
  const registered: any[] = []
  const state = { invalidates: 0 }
  const files = options.files ?? { '/work/.obsidian.yaml': 'vault: obsidian\npm:\n  project: cc-plugins\n' }
  const answers: Record<string, CliAnswer> = { search: options.search ?? LIST, read: options.read ?? CARD }
  const defaults: Record<string, string> = { search: LIST, read: CARD }

  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  const clock = mock.clock(on)
  on('session.cwd', () => ({ value: options.cwd ?? '/work' }))
  on('fs.exists', ($: any, e: any) => {
    existsCalls.push(e.path)
    return options.exists ?? { value: e.path in files }
  })
  on('fs.read', ($: any, e: any) => {
    readCalls.push(e.path)
    const file = files[e.path]
    if (file === undefined) return { deny: 'ENOENT' }
    if (typeof file !== 'string') return file
    return { value: file }
  })
  on('command.register', ($: any, e: any) => {
    registered.push(e)
    return options.register ?? { value: { command: e.name } }
  })
  on('ui.open', ($: any, e: any) => {
    opened.push(e)
    return options.open ?? { value: undefined }
  })
  on('ui.invalidate', () => {
    state.invalidates += 1
    return { value: undefined }
  })
  on('process.run', async ($: any, e: any) => {
    runs.push(e)
    const verb = e.argv[2]
    const answer = answers[verb]
    if (answer === undefined) return { deny: `no answer for ${verb}` }
    if (answer === 'hang') {
      await clock.sleep(60000)
      return { value: { exitCode: 0, stdout: defaults[verb], stderr: '' } }
    }
    if (typeof answer === 'string') return { value: { exitCode: 0, stdout: answer, stderr: '' } }
    if ('deny' in answer) return { deny: answer.deny }
    return { value: { stdout: '', stderr: '', ...answer } }
  })

  return {
    clock,
    runs,
    existsCalls,
    readCalls,
    opened,
    registered,
    get invalidates() {
      return state.invalidates
    },
  }
}
