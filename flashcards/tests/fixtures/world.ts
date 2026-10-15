import { mock } from 'claude-code/testing'

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

// The command typed at the prompt, as the engine stamps it.
export function cards(args = '') {
  return {
    command: 'cards',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  } as const
}

export function paneProps(title: string) {
  return {
    title,
    isFocused: true,
    bodyColumns: 40,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 14 },
    view: {},
  } as const
}

type Entry = { name: string; kind: 'file' | 'dir' | 'other' }

export type WorldOptions = {
  store?: Record<string, unknown>
  refuse?: 'get' | 'set'
  registerDeny?: boolean
  files?: Record<string, string | { deny: string }>
  dirs?: Record<string, Entry[] | { deny: string }>
  query?: string | { deny: string }
  reads?: Record<string, string | { deny: string }>
  spawn?: (n: number) => unknown
  now?: number
}

// A stub world beneath the plugin, recording what it asks of the engine.
export function world(on: any, options: WorldOptions = {}) {
  const data: Record<string, unknown> = { ...(options.store ?? {}) }
  const seen = {
    refuse: options.refuse as 'get' | 'set' | undefined,
    commands: [] as any[],
    opened: [] as any[],
    closed: [] as any[],
    toasts: [] as string[],
    spawns: [] as any[],
    models: [] as any[],
    tools: [] as any[],
    runs: [] as any[],
    invalidates: 0,
    store: data,
    clock: null as any,
  }
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  seen.clock = mock.clock(on, { now: options.now ?? 1000 })
  on('session.cwd', () => ({ value: SESSION.cwd }))
  on('session.repo', () => ({ value: null }))
  on('session.root', () => ({ value: SESSION.cwd }))
  on('turn.complete', () => ({ text: '' }))
  on('store.get', ($: any, e: any) => {
    if (seen.refuse === 'get') return { deny: 'store unavailable' }
    return { value: data[e.key] }
  })
  on('store.set', ($: any, e: any) => {
    if (seen.refuse === 'set') return { deny: 'store unavailable' }
    data[e.key] = e.value
    return { value: undefined }
  })
  on('command.register', ($: any, e: any) => {
    if (options.registerDeny) return { deny: 'command slot taken' }
    seen.commands.push(e)
    return { value: { command: e.name } }
  })
  on('ui.open', ($: any, e: any) => {
    seen.opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($: any, e: any) => {
    seen.closed.push(e)
    return { value: undefined }
  })
  on('ui.toast', ($: any, e: any) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.invalidate', () => {
    seen.invalidates += 1
    return { value: undefined }
  })
  on('fs.exists', ($: any, e: any) => ({ value: e.path in (options.files ?? {}) || e.path in (options.dirs ?? {}) }))
  on('fs.read', ($: any, e: any) => {
    const file = options.files?.[e.path]
    if (file === undefined) return { deny: 'ENOENT' }
    return typeof file === 'string' ? { value: file } : file
  })
  on('fs.list', ($: any, e: any) => {
    const dir = options.dirs?.[e.path]
    if (dir === undefined) return { deny: 'ENOENT' }
    return Array.isArray(dir) ? { value: dir } : dir
  })
  on('process.run', ($: any, e: any) => {
    seen.runs.push(e)
    const argv: string[] = e.argv
    if (argv[2] === 'base:query') {
      const query = options.query ?? '[]'
      return typeof query === 'string' ? { value: { exitCode: 0, stdout: query, stderr: '' } } : query
    }
    const path = argv[3].slice('path='.length)
    const read = options.reads?.[path] ?? `Error: File "${path}" not found.\n`
    return typeof read === 'string' ? { value: { exitCode: 0, stdout: read, stderr: '' } } : read
  })
  on('model.complete', ($: any, e: any) => {
    seen.models.push(e)
    return { deny: 'recorded by the test world' }
  })
  on('tool.call', ($: any, e: any) => {
    seen.tools.push(e)
    return { deny: 'recorded by the test world' }
  })
  on('agent.spawn', ($: any, e: any) => {
    seen.spawns.push(e)
    const n = seen.spawns.length
    return options.spawn?.(n) ?? { model: 'haiku', agentId: `agent-${n}` }
  })
  on('agent.list', () => ({
    value: seen.spawns.map((_, i) => ({ id: `agent-${i + 1}`, spawnedBy: 'flashcards', description: '', type: 'general-purpose', status: 'completed' })),
  }))
  return seen
}
