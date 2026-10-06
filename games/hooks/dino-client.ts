import type { ClientSurface } from 'claude-code'
import { DEFAULT_WIDTH, duck, jump, newRun, pixelGridOf, scoreOf, step, textRowsOf, TICK_MS } from './dino.ts'
import type { Ink, Run } from './dino.ts'

type Props = { best: number }

const HINTS: Record<Run['phase'], string> = {
  ready: 'Click here, then space or ↑ to start.',
  running: 'space or ↑ jumps, ↓ ducks. Esc hands the keys back.',
  over: 'Crashed. space runs again.',
}

// The space bar's name is not in the typings; take it however the surface spells it.
function isJump(key: string) {
  return key === 'up' || key === 'w' || key === 'space' || key.trim() === ''
}

const isDuck = (key: string) => key === 'down' || key === 's'

// Theme keys, so the field follows the person's /theme.
function colorOf(ink: Ink, run: Run): string | undefined {
  if (ink === 1) return run.phase === 'over' ? 'error' : 'text'
  if (ink === 2) return 'success'
  if (ink === 3) return 'claude'
  return undefined
}

// Runs on the surface's frame clock, so the game never waits on a hook round trip.
export default function Dino(props: Props, surface: ClientSurface<Run>) {
  const { Box, Text } = surface.elements
  const width = () => surface.columns || DEFAULT_WIDTH
  if (surface.state === undefined) {
    surface.every(TICK_MS, () => {
      const run = surface.state
      if (!run || run.phase !== 'running') return
      const next = step(run, width(), Math.random)
      surface.setState(next)
      if (next.phase === 'over') surface.post({ score: scoreOf(next) })
    })
    // Leaves the state defined, so the next call does not start a second timer.
    surface.setState(newRun())
  }
  const run = surface.state ?? newRun()
  surface.onKey(({ key }) => {
    const now = surface.state ?? newRun()
    if (isJump(key)) surface.setState(jump(now))
    else if (isDuck(key)) surface.setState(duck(now))
  })
  const score = scoreOf(run)
  const field = textRowsOf(pixelGridOf(run, width())).map((segs) =>
    Text({
      wrap: 'truncate-end',
      children: segs.map((s) =>
        s.fg || s.bg ? Text({ color: colorOf(s.fg, run), backgroundColor: colorOf(s.bg, run), children: [s.text] }) : s.text,
      ),
    }),
  )
  return Box({
    flexDirection: 'column',
    children: [
      Box({ key: 'score', children: [Text({ children: [`Score ${score}   Best ${Math.max(props.best, score)}`] })] }),
      Box({ key: 'field', flexDirection: 'column', children: field }),
      Text({ color: 'inactive', wrap: 'truncate-end', children: ['▀'.repeat(width())] }),
      Text({ color: run.phase === 'over' ? 'error' : undefined, dimColor: run.phase !== 'over', children: [HINTS[run.phase]] }),
    ],
  })
}
