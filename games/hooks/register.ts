import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'
import { GOAL, move, newGame, SIZE } from './game2048.ts'
import type { Dir } from './game2048.ts'
import type { Game } from '../types'

const PANE = '2048'
const BEST_KEY = 'best2048'
const CELL_WIDTH = 6

const game = atom({ plugin: 'games', key: 'game2048' } as const, null)
const best = atom({ plugin: 'games', key: 'best2048' } as const, 0)

// Hotkeys only take a letter or digit, so the arrows cannot drive the board.
const MOVES: { dir: Dir; hotkey: string; glyph: string }[] = [
  { dir: 'up', hotkey: 'w', glyph: '↑' },
  { dir: 'left', hotkey: 'a', glyph: '←' },
  { dir: 'down', hotkey: 's', glyph: '↓' },
  { dir: 'right', hotkey: 'd', glyph: '→' },
]

// Theme keys, so the tiles follow the person's /theme.
const TILE_COLORS: Record<number, string> = {
  2: 'text',
  4: 'text',
  8: 'suggestion',
  16: 'suggestion',
  32: 'warning',
  64: 'warning',
  128: 'claude',
  256: 'claude',
  512: 'permission',
  1024: 'permission',
}

function tileColor(value: number): string {
  return value === 0 ? 'subtle' : (TILE_COLORS[value] ?? 'success')
}

async function remember($: EngineInterface, score: number) {
  try {
    await $.store.set(BEST_KEY, score)
  } catch {
    // The best score still shows for this session; only the next one will not remember it.
  }
}

async function start($: EngineInterface) {
  await update($, game, () => newGame(Math.random))
}

async function play($: EngineInterface, dir: Dir) {
  const after = await update($, game, (g) => (g ? move(g, dir, Math.random) : g))
  if (!after) return
  const before = await read($, best)
  if (after.score > before) {
    await update($, best, (b) => Math.max(b, after.score))
    await remember($, after.score)
  }
}

function statusOf(g: Game): { text: string; color?: string } {
  if (g.isOver) return { text: 'No moves left. n starts a new game.', color: 'error' }
  if (g.hasWon) return { text: `${GOAL}! Keep going for a higher score.`, color: 'success' }
  return { text: 'Esc hands the keys back; /2048 takes them again.' }
}

export const register: Register = (on) => {
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: '2048',
        description: 'Play 2048 in a pane while Claude works',
        immediate: true,
      })
    } catch {
      // A refused /2048 leaves nothing else to run.
    }
    try {
      const stored = await $.store.get(BEST_KEY)
      if (typeof stored === 'number') await update($, best, (b) => Math.max(b, stored))
    } catch {
      // Without the store the best score starts from this session.
    }
    return next(e)
  })

  on('command.run', { command: '2048' }, async ($) => {
    if (!(await read($, game))) await start($)
    await $.ui.open({ id: PANE, title: '2048', focus: true })
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const g = await read($, game)
    if (!g) return Text({ dimColor: true, children: ['Run /2048 to start.'] })
    const top = await read($, best)
    const rows = [...Array(SIZE).keys()].map((r) =>
      Box({
        key: `row:${r}`,
        children: g.board.slice(r * SIZE, (r + 1) * SIZE).map((v) =>
          Text({ color: tileColor(v), bold: v >= GOAL, children: [String(v || '·').padStart(CELL_WIDTH)] }),
        ),
      }),
    )
    const status = statusOf(g)
    return Box({
      flexDirection: 'column',
      children: [
        Box({ key: 'score', children: [Text({ children: [`Score ${g.score}   Best ${Math.max(top, g.score)}`] })] }),
        Box({ flexDirection: 'column', children: rows }),
        Text({ color: status.color, dimColor: !status.color, children: [status.text] }),
        Box({
          flexDirection: 'row',
          gap: 2,
          children: [
            ...MOVES.map((m) =>
              Button({ key: m.dir, label: m.glyph, hotkey: m.hotkey, plain: true, onPress: () => play($, m.dir) }),
            ),
            Button({ key: 'new', label: 'new', hotkey: 'n', plain: true, onPress: () => start($) }),
            Button({ key: 'close', label: 'close', hotkey: 'q', plain: true, onPress: () => $.ui.close({ id: PANE }) }),
          ],
        }),
      ],
    })
  })
}
