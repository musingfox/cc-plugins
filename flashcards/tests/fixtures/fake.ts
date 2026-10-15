// The engine nouns a module reads through `$`, stubbed for a test that calls the module directly.
// A string answers; `{ deny }` makes the call reject, as the engine does for a refused op.
type Answer = string | { deny: string }
type Entry = { name: string; kind: 'file' | 'dir' | 'other' }
export type RunAnswer = { exitCode: number; stdout: string; stderr: string } | { deny: string }

export type FakeOptions = {
  cwd?: string
  files?: Record<string, Answer>
  dirs?: Record<string, Entry[] | { deny: string }>
  run?: (argv: string[], init: { timeoutMs?: number }) => RunAnswer
  store?: Record<string, unknown>
  refuse?: 'get' | 'set'
}

export function fake(options: FakeOptions = {}) {
  const files = options.files ?? {}
  const data: Record<string, unknown> = { ...(options.store ?? {}) }
  const runs: { argv: string[]; timeoutMs?: number }[] = []
  const reject = (answer: { deny: string }): never => {
    throw new Error(answer.deny)
  }
  const $ = {
    session: { cwd: async () => options.cwd ?? '/work' },
    fs: {
      exists: async (path: string) => path in files || path in (options.dirs ?? {}),
      read: async (path: string) => {
        const answer = files[path]
        if (answer === undefined) return reject({ deny: 'ENOENT' })
        return typeof answer === 'string' ? answer : reject(answer)
      },
      list: async (path: string) => {
        const answer = options.dirs?.[path]
        if (answer === undefined) return reject({ deny: 'ENOENT' })
        return Array.isArray(answer) ? answer : reject(answer)
      },
    },
    process: {
      run: async (argv: string[], init: { timeoutMs?: number } = {}) => {
        runs.push({ argv, timeoutMs: init.timeoutMs })
        const answer = options.run?.(argv, init) ?? { exitCode: 0, stdout: '', stderr: '' }
        return 'deny' in answer ? reject(answer) : answer
      },
    },
    store: {
      get: async (key: string) => {
        if (options.refuse === 'get') return reject({ deny: 'store unavailable' })
        return data[key]
      },
      set: async (key: string, value: unknown) => {
        if (options.refuse === 'set') return reject({ deny: 'store unavailable' })
        data[key] = value
      },
    },
  }
  return { $: $ as any, runs, data }
}
