import { mock } from 'claude-code/testing'

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

export const CARD =
  '---\ntitle: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\ndue:\ntags:\n  - claude-mods\ncreated: 2026-09-18\n---\n# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n'

// One mermaid block between two markdown runs; CARD stays fence-free.
export const MERMAID_CARD = '---\ntitle: m\n---\n# m\n\n```mermaid\ngraph LR\nA-->B\n```\n\ntail\n'

export const DIAGRAM = ' ┌─┐\n │A│\n └─┘\n'

export const VIEWS = 'Active\ttable\nBlocked\ttable\nBy Parent\ttable\nRecently Completed\ttable\nBy Tag\ttable\nDocs\ttable\n'
export const QUERY_ARGV = ['obsidian', 'vault=obsidian', 'base:query', 'path=pm/cc-plugins/dashboard.base', 'view=Active', 'format=json']
const LIST = '[{"path":"pm/cc-plugins/tasks/a.md","status":"todo"}]'
export const AB = '[{"path":"pm/cc-plugins/tasks/a.md","status":"todo"},{"path":"pm/cc-plugins/tasks/b.md","status":"todo"}]'

export const CONFIG = 'vault: obsidian\npm:\n  project: cc-plugins\n'

const RENDERED = '/tmp/viz/work/obw-mod-obw-issue-pane-260919120000.html\n'

// An installed_plugins.json with one user-scope viz install at `root`.
export function manifest(root: string) {
  return JSON.stringify({ version: 2, plugins: { 'viz@m': [{ scope: 'user', installPath: root, version: '1.1.4' }] } })
}

// A string is stdout with exit 0; 'hang' answers the default after 60 s on the mock clock;
// 'defer' stays open until the test calls `release` with that run's index in `runs`.
export type CliAnswer = string | { exitCode: number; stdout?: string; stderr?: string } | { deny: string } | 'hang' | 'defer'

export type WorldOptions = {
  cwd?: string
  files?: Record<string, string | { deny: string }>
  exists?: { deny: string }
  views?: CliAnswer
  query?: CliAnswer
  read?: CliAnswer
  register?: { deny: string }
  open?: { deny: string }
  env?: Record<string, string>
  write?: { deny: string }
  render?: CliAnswer
  termaid?: CliAnswer
}

// A stub world beneath the plugin: every $ call it makes is answered and recorded here.
// `obsidian … base:views`, `base:query`, and `read` runs are answered by their matching options, `uvx` runs by `termaid`,
// any other run by `render`.
// `$.env.get` is answered only when `env` is given; without it the call rejects.
export function world(on: any, options: WorldOptions = {}) {
  for (const key of Object.keys(options)) if (!['cwd', 'files', 'exists', 'views', 'query', 'read', 'register', 'open', 'env', 'write', 'render', 'termaid'].includes(key)) throw new Error(`stale world option: ${key}`)
  const runs: any[] = []
  const existsCalls: string[] = []
  const readCalls: string[] = []
  const opened: any[] = []
  const registered: any[] = []
  const writes: { path: string; text: string }[] = []
  const state = { invalidates: 0 }
  const deferred = new Map<number, (stdout: string) => void>()
  const files = options.files ?? { '/work/.obsidian.yaml': CONFIG }
  const answers: Record<string, CliAnswer> = {
    'base:views': options.views ?? VIEWS,
    'base:query': options.query ?? LIST,
    read: options.read ?? CARD,
    render: options.render ?? RENDERED,
    termaid: options.termaid ?? DIAGRAM,
  }
  const defaults: Record<string, string> = { 'base:views': VIEWS, 'base:query': LIST, read: CARD, render: RENDERED, termaid: DIAGRAM }

  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  const clock = mock.clock(on)
  if (options.env) mock.env(on, options.env)
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
  on('fs.write', ($: any, e: any) => {
    writes.push({ path: e.path, text: e.text })
    return options.write ?? { value: undefined }
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
    const verb = e.argv[0] === 'obsidian' ? e.argv[2] : e.argv[0] === 'uvx' ? 'termaid' : 'render'
    const answer = answers[verb]
    if (answer === undefined) return { deny: `no answer for ${verb}` }
    if (answer === 'defer') {
      const stdout = await new Promise<string>((resolve) => deferred.set(runs.length - 1, resolve))
      return { value: { exitCode: 0, stdout, stderr: '' } }
    }
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
    writes,
    release(run: number, stdout: string) {
      deferred.get(run)!(stdout)
    },
    get invalidates() {
      return state.invalidates
    },
  }
}
