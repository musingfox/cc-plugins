import { mock } from 'claude-code/testing'

export const NOW = 1789708507153
export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
export const ROOT = '/tmp/cf-1008-Rez6'
export const ROOT2 = '/tmp/cf-1008-Ab12'
export const ENV = `SESSION="${ROOT}"\nSESSION_BASENAME="cf-1008-Rez6"\nCF_SLUG="mod-band"\nCLEANUP_SCRIPT="${ROOT}/cleanup.sh"\nPI_DISPATCH_CMD=pi\\ --api-key\\ sk-live-SECRET\n`
export const ENV2 = ENV.replaceAll(ROOT, ROOT2).replace('mod-band', 'other-flow').replace('cf-1008-Rez6', 'cf-1008-Ab12')
export const BENEATH = { type: 'Text', children: ['beneath'] }
export const SETUP_OUT = `${ROOT}\nSESSION=${ROOT}\n`
export const ok = (stdout: string) => ({ result: { stdout, stderr: '', interrupted: false }, text: stdout })

export type WorldOptions = {
  // A string is the file; { deny } rejects the read; 'defer' never settles it. A path not listed is ENOENT.
  files?: Record<string, string | { deny: string } | 'defer'>
  // Entries the store starts with, or 'refuse' to deny every store call.
  store?: Record<string, unknown> | 'refuse'
  // What the rest of the chain draws in the band.
  beneath?: unknown
}

// A stub world beneath the plugin: every $ call it makes is answered and recorded here.
// `files` and `store` are live: a test changes them after the world exists.
export function world(on: any, options: WorldOptions = {}) {
  for (const key of Object.keys(options)) if (!['files', 'store', 'beneath'].includes(key)) throw new Error(`stale world option: ${key}`)
  const readCalls: string[] = []
  const storeCalls: { op: string; key?: string }[] = []
  const files: Record<string, string | { deny: string } | 'defer'> = { ...(options.files ?? {}) }
  const entries = new Map<string, unknown>(options.store && options.store !== 'refuse' ? Object.entries(options.store) : [])
  const state = { invalidates: 0 }

  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  const clock = mock.clock(on, { now: NOW })
  on('turn.complete', () => ({ text: '' }))
  on('session.end', ($: any, e: any) => ({ sessionId: e.sessionId }))
  on('ui.render', { component: 'AbovePrompt' }, () => options.beneath ?? { type: 'Box', children: [] })
  on('ui.invalidate', () => {
    state.invalidates += 1
    return { value: undefined }
  })
  on('fs.read', async ($: any, e: any) => {
    readCalls.push(e.path)
    const file = files[e.path]
    if (file === undefined) return { deny: 'ENOENT' }
    if (file === 'defer') return new Promise(() => {})
    if (typeof file !== 'string') return file
    return { value: file }
  })
  const store = (op: string, handler: ($: any, e: any) => unknown) =>
    on(`store.${op}`, ($: any, e: any) => {
      storeCalls.push({ op, key: e.key })
      return options.store === 'refuse' ? { deny: 'store unavailable' } : handler($, e)
    })
  store('get', (_: any, e: any) => ({ value: entries.get(e.key) }))
  store('set', (_: any, e: any) => (entries.set(e.key, e.value), { value: undefined }))
  store('delete', (_: any, e: any) => (entries.delete(e.key), { value: undefined }))
  store('keys', () => ({ value: [...entries.keys()] }))

  return {
    clock,
    readCalls,
    storeCalls,
    files,
    flows: () => entries.get('flows') as any,
    hasStoreKey: (key: string) => entries.has(key),
    get invalidates() {
      return state.invalidates
    },
  }
}

// "Open flow": session started, a main-loop Bash answered the setup output, settled. `bash.answer` is what later Bash calls return.
export async function openFlow($: any, on: any, options: WorldOptions = {}) {
  const w = world(on, { files: { [`${ROOT}/env.sh`]: ENV }, beneath: BENEATH, ...options })
  const bash = { answer: ok(SETUP_OUT) as unknown }
  on('tool.call', { tool: 'Bash' }, () => bash.answer)
  await $.session.start(SESSION)
  await w.clock.settle()
  await $.tool.call({ tool: 'Bash', command: 'cf setup' })
  await w.clock.settle()
  return { w, bash }
}
