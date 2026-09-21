import { mock } from 'claude-code/testing'

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

export const CARD =
  '---\ntitle: "Claude Mod：面板顯示 obw 的 task 與 issue"\nstatus: todo\npriority: medium\ndue:\ntags:\n  - claude-mods\ncreated: 2026-09-18\n---\n# mod-obw-issue-pane\n\n## Acceptance Criteria\n- [ ] one\n'

// One mermaid block between two markdown runs; CARD stays fence-free.
export const MERMAID_CARD = '---\ntitle: m\n---\n# m\n\n```mermaid\ngraph LR\nA-->B\n```\n\ntail\n'

export const DIAGRAM = ' ┌─┐\n │A│\n └─┘\n'

export const VIEW_NAMES = ['Active', 'Blocked', 'By Parent', 'Recently Completed', 'By Tag', 'Docs', 'All Tasks']
export const VIEWS = `properties:
  formula.display:
    displayName: "Title"
views:
${VIEW_NAMES.map((name) => `  - type: table
    name: "${name}"
    filters:
      and:
        - 'type == "task"'
`).join('\n')}`
// Every string the view Select draws: each name is its own option value and label.
export const VIEW_STRINGS = VIEW_NAMES.flatMap((name) => [name, name])
export const DASHBOARD_ARGV = ['obsidian', 'vault=obsidian', 'read', 'path=pm/cc-plugins/dashboard.base']
export const QUERY_ARGV = ['obsidian', 'vault=obsidian', 'base:query', 'path=pm/cc-plugins/dashboard.base', 'view=Active', 'format=json']
export const ALL_TASKS_ARGV = ['obsidian', 'vault=obsidian', 'base:query', 'path=pm/cc-plugins/dashboard.base', 'view=All Tasks', 'format=json']
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
  reads?: Record<string, CliAnswer>
  register?: { deny: string }
  open?: { deny: string }
  env?: Record<string, string>
  write?: { deny: string }
  render?: CliAnswer
  termaid?: CliAnswer
}

export function kindOf(argv: string[]) {
  if (argv[0] === 'uvx') return 'termaid'
  if (argv[0] !== 'obsidian') return 'render'
  if (argv[2] === 'read' && argv[3]?.startsWith('path=') && argv[3].endsWith('/dashboard.base')) return 'views'
  return argv[2]
}

// A read of a path the `reads` option does not name is the CLI's own miss, so a test that expects the
// wrong path cannot pass on another card's text.
function readAnswer(reads: Record<string, CliAnswer>, argv: string[]): CliAnswer {
  const path = argv[3].slice('path='.length)
  return reads[path] ?? `Error: File "${path}" not found.\n`
}

// A stub world beneath the plugin: every $ call it makes is answered and recorded here.
// A dashboard `read` of `…/dashboard.base` is answered by `views` (before `reads`), `base:query` by `query`,
// other `read` runs by `read`/`reads`, `uvx` by `termaid`, any other run by `render`.
// `$.env.get` is answered only when `env` is given; without it the call rejects.
export function world(on: any, options: WorldOptions = {}) {
  for (const key of Object.keys(options)) if (!['cwd', 'files', 'exists', 'views', 'query', 'read', 'reads', 'register', 'open', 'env', 'write', 'render', 'termaid'].includes(key)) throw new Error(`stale world option: ${key}`)
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
    views: options.views ?? VIEWS,
    'base:query': options.query ?? LIST,
    read: options.read ?? CARD,
    render: options.render ?? RENDERED,
    termaid: options.termaid ?? DIAGRAM,
  }
  const defaults: Record<string, string> = { views: VIEWS, 'base:query': LIST, read: CARD, render: RENDERED, termaid: DIAGRAM }

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
    const verb = kindOf(e.argv)
    const answer = verb === 'read' && options.reads ? readAnswer(options.reads, e.argv) : answers[verb]
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
