import { mock } from 'claude-code/testing'

export const NOW = Date.parse('2026-10-20T10:02:05Z')
export const HOME = '/home/u'
export const RUNS = `${HOME}/.cache/muster/runs`
export const ROOT = '/r'
export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

type Entry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean }
export type Files = Record<string, string | { deny: string } | 'defer'>
export type Dirs = Record<string, Entry[] | { deny: string } | 'defer'>

export const dir = (name: string): Entry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
export const file = (name: string): Entry => ({ name, kind: 'file', size: 1, mtimeMs: 0, isLink: false })

// A stand-in for the engine's $ handed straight to the board reader: the same reads, answered from the options and recorded.
export function fakeEngine(options: { env?: Record<string, string | 'deny'>; root?: string; files?: Files; dirs?: Dirs } = {}) {
  const reads: string[] = []
  const lists: string[] = []
  const answer = <T>(table: Record<string, T | { deny: string } | 'defer'>, path: string, record: string[]): Promise<T> => {
    record.push(path)
    const value = table[path]
    if (value === undefined) return Promise.reject(new Error('ENOENT'))
    if (value === 'defer') return new Promise<T>(() => {})
    if (typeof value === 'object' && value !== null && 'deny' in value) return Promise.reject(new Error((value as { deny: string }).deny))
    return Promise.resolve(value as T)
  }
  const $ = {
    env: {
      get: (name: string) => {
        const value = (options.env ?? { HOME })[name]
        return value === 'deny' ? Promise.reject(new Error('denied')) : Promise.resolve(value)
      },
    },
    session: { root: () => Promise.resolve(options.root ?? ROOT) },
    clock: { now: () => Promise.resolve(NOW) },
    fs: {
      read: (path: string) => answer(options.files ?? {}, path, reads),
      list: (path: string) => answer(options.dirs ?? {}, path, lists),
    },
  }
  return { $, reads, lists }
}

export const BENEATH = { type: 'Text', children: ['beneath'], part: { plugin: 'test' } }

// A stub world beneath the band for the engine's own test body: env, clock, session root and the file reads are answered from the options, every read recorded.
export function kitWorld(on: any, options: { env?: Record<string, string>; root?: string; files?: Files; dirs?: Dirs; beneath?: unknown } = {}) {
  mock.env(on, options.env ?? { HOME })
  const clock = mock.clock(on, { now: NOW })
  on('ui.render', { component: 'AbovePrompt' }, () => options.beneath ?? BENEATH)
  const state = { rootDenied: false }
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  on('session.root', () => (state.rootDenied ? { deny: 'root unavailable' } : { value: options.root ?? ROOT }))
  const files: Files = options.files ?? {}
  const dirs: Dirs = options.dirs ?? {}
  const reads: string[] = []
  const lists: string[] = []
  on('fs.read', (_: any, e: any) => {
    reads.push(e.path)
    const answer = files[e.path]
    if (answer === undefined) return { deny: 'ENOENT' }
    if (answer === 'defer') return new Promise(() => {})
    return typeof answer === 'string' ? { value: answer } : answer
  })
  on('fs.list', (_: any, e: any) => {
    lists.push(e.path)
    const answer = dirs[e.path]
    if (answer === undefined) return { deny: 'ENOENT' }
    if (answer === 'defer') return new Promise(() => {})
    return 'deny' in (answer as object) ? answer : { value: answer }
  })
  return { clock, files, dirs, reads, lists, state }
}
