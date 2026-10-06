import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { COLS, countAt, dig, flag, MINE_COUNT, moveCursor, newMines, ROWS } from './mines.ts'
import type { Dir } from './mines.ts'
import type { Mines } from '../types'

const PANE = 'mines'

const game = atom({ plugin: 'games', key: 'mines' } as const, null)

const MOVES: { dir: Dir; hotkey: string; glyph: string }[] = [
  { dir: 'up', hotkey: 'w', glyph: '↑' },
  { dir: 'left', hotkey: 'a', glyph: '←' },
  { dir: 'down', hotkey: 's', glyph: '↓' },
  { dir: 'right', hotkey: 'd', glyph: '→' },
]

// Theme keys, so the numbers follow the person's /theme.
const NUMBER_COLORS = ['', 'suggestion', 'success', 'error', 'permission', 'claude', 'warning', 'text', 'inactive']

// ASCII glyphs: an ambiguous-width one (·, ⚑) drifts the grid in a CJK terminal.
function cellOf(g: Mines, k: number): { glyph: string; color?: string } {
  const isMine = g.mines?.[k] ?? false
  if (g.state === 'lost' && isMine) return { glyph: '*', color: 'error' }
  if (g.flagged[k]) return { glyph: 'F', color: 'warning' }
  if (!g.revealed[k]) return { glyph: '.', color: 'subtle' }
  const n = countAt(g.mines!, k)
  return n === 0 ? { glyph: ' ' } : { glyph: String(n), color: NUMBER_COLORS[n] }
}

function statusOf(g: Mines): { text: string; color?: string } {
  if (g.state === 'lost') return { text: 'Boom. n starts a new game.', color: 'error' }
  if (g.state === 'won') return { text: 'Cleared! n starts a new game.', color: 'success' }
  return { text: 'e digs, f flags. Esc hands the keys back; /mines takes them again.' }
}

async function act($: EngineInterface, change: (g: Mines) => Mines) {
  await update($, game, (g) => (g ? change(g) : g))
}

export const COMMAND_MINES = {
  name: 'mines',
  description: 'Play Minesweeper in a pane while Claude works',
  immediate: true,
} as const

export function registerMines(on: On) {
  on('command.run', { command: 'mines' }, async ($) => {
    if (!(await read($, game))) await update($, game, () => newMines())
    await $.ui.open({ id: PANE, title: 'Minesweeper', focus: true })
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const g = await read($, game)
    if (!g) return Text({ dimColor: true, children: ['Run /mines to start.'] })
    const flags = g.flagged.filter(Boolean).length
    const rows = [...Array(ROWS).keys()].map((r) =>
      Box({
        key: `row:${r}`,
        children: [...Array(COLS).keys()].map((c) => {
          const k = r * COLS + c
          const cell = cellOf(g, k)
          return Text({
            color: cell.color,
            inverse: k === g.cursor || k === g.hit,
            bold: k === g.hit,
            children: [` ${cell.glyph}`],
          })
        }),
      }),
    )
    const status = statusOf(g)
    return Box({
      flexDirection: 'column',
      children: [
        Box({ key: 'count', children: [Text({ children: [`Mines ${MINE_COUNT - flags}`] })] }),
        Box({ flexDirection: 'column', children: rows }),
        Text({ color: status.color, dimColor: !status.color, children: [status.text] }),
        Box({
          flexDirection: 'row',
          gap: 2,
          children: [
            ...MOVES.map((m) =>
              Button({
                key: m.dir,
                label: m.glyph,
                hotkey: m.hotkey,
                plain: true,
                onPress: () => act($, (g) => moveCursor(g, m.dir)),
              }),
            ),
            Button({ key: 'dig', label: 'dig', hotkey: 'e', plain: true, onPress: () => act($, (g) => dig(g, Math.random)) }),
            Button({ key: 'flag', label: 'flag', hotkey: 'f', plain: true, onPress: () => act($, flag) }),
            Button({ key: 'new', label: 'new', hotkey: 'n', plain: true, onPress: () => update($, game, () => newMines()) }),
            Button({ key: 'close', label: 'close', hotkey: 'q', plain: true, onPress: () => $.ui.close({ id: PANE }) }),
          ],
        }),
      ],
    })
  })
}
