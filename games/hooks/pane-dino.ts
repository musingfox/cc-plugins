import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { FIELD_ROWS } from './dino.ts'

const PANE = 'dino'
const BEST_KEY = 'bestDino'
// The score line, the sky, the ground and the hint.
const CLIENT_ROWS = FIELD_ROWS + 3

const best = atom({ plugin: 'games', key: 'bestDino' } as const, 0)

export const COMMAND_DINO = {
  name: 'dino',
  description: 'Play the Chrome dino runner in a pane while Claude works',
  immediate: true,
} as const

async function loadBest($: EngineInterface) {
  try {
    const stored = await $.store.get(BEST_KEY)
    if (typeof stored === 'number') await update($, best, (b) => Math.max(b, stored))
  } catch {
    // Without the store the best score starts from this session.
  }
}

async function remember($: EngineInterface, score: number) {
  try {
    await $.store.set(BEST_KEY, score)
  } catch {
    // The best score still shows for this session; only the next one will not remember it.
  }
}

export function registerDino(on: On) {
  on('command.run', { command: 'dino' }, async ($) => {
    await loadBest($)
    await $.ui.open({ id: PANE, title: 'Dino', focus: true })
    return {}
  })

  // The run's state lives in the Client; it posts only a finished run's score.
  on('ui.message', { requestId: PANE }, async ($, e) => {
    const score = (e.data as { score?: unknown } | null)?.score
    if (typeof score !== 'number') return {}
    const top = await update($, best, (b) => Math.max(b, score))
    if (top === score) await remember($, score)
    return { props: { best: top } }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // A Client draws only where the surface runs its module.
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      const { Text } = $.ui.resolve(e)
      return Text({ dimColor: true, children: ['Dino needs the terminal or the desktop app.'] })
    }
    const { Box, Button, Client } = $.ui.resolve(e)
    const top = await read($, best)
    return Box({
      flexDirection: 'column',
      children: [
        Client({ key: 'dino', module: './dino-client.ts', width: '100%', height: CLIENT_ROWS, props: { best: top } }),
        Button({ key: 'close', label: 'close', hotkey: 'q', plain: true, onPress: () => $.ui.close({ id: PANE }) }),
      ],
    })
  })
}
