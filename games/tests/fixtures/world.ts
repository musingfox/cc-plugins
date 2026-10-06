import { mock } from 'claude-code/testing'

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

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

// The command typed at the prompt, as the engine stamps it.
export function run(command: string) {
  return {
    command,
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  } as const
}

// A stub world beneath the plugin, recording what it asks of the engine.
export function world(on: any, store: Record<string, unknown> = {}) {
  const seen = { commands: [] as any[], opened: [] as any[], closed: [] as any[] }
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  mock.store(on, store)
  on('command.register', ($: any, e: any) => {
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
  return seen
}
