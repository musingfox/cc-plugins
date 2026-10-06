// Units are pixels and ticks. A text cell is one pixel wide and two tall: a half block
// (▀ ▄ █) draws the top, the bottom or both. One tick is TICK_MS.
export const TICK_MS = 50
export const FIELD_ROWS = 8
export const FIELD_PX = FIELD_ROWS * 2
export const DINO_X = 3
export const DEFAULT_WIDTH = 60

// A jump peaks near JUMP_PEAK pixels after JUMP_TICKS / 2 ticks; stepping in whole ticks
// overshoots by about one, which the dino's head needs room for under the field's top.
const JUMP_PEAK = 7
const JUMP_TICKS = 16
const JUMP_V = (4 * JUMP_PEAK) / JUMP_TICKS
const GRAVITY = (8 * JUMP_PEAK) / JUMP_TICKS ** 2
const START_SPEED = 1.4
const MAX_SPEED = 2.8
const ACCEL = 0.0012
const GAP_SPREAD = 60
const STRIDE_TICKS = 3
const FLAP_TICKS = 4
// A terminal sends no key release, so a duck lasts this long past the last ↓; holding ↓
// repeats the key before it runs out.
export const DUCK_TICKS = 10
// Birds join once the run has warmed up, as in Chrome.
const BIRDS_AFTER = 400
const BIRD_CHANCE = 0.35

// Rows top first; '#' is a pixel.
const STAND = [
  '.....#####',
  '.....#.###',
  '.....#####',
  '#...####..',
  '##.#####..',
  '.######...',
]
const STAND_LEGS = {
  still: ['..#..#....', '..##.##...'],
  left: ['..#..#....', '..##......'],
  right: ['...#..#...', '......##..'],
}
const DUCK = ['........####', '#..######.##', '###########.', '.########...']
const DUCK_LEGS = { left: ['..#..#......'], right: ['...#..#.....'] }

const BIRD_UP = ['...#....', '...##...', '##.#####', '.######.', '........']
const BIRD_DOWN = ['........', '........', '##.#####', '.######.', '...##...']

export type Ink = 0 | 1 | 2 | 3
export const DINO: Ink = 1
export const TREE: Ink = 2
export const BIRD: Ink = 3

type Kind = { frames: string[][]; y: number; ink: Ink }

// A mid bird flies through a standing dino and over a ducking one; a high bird flies over
// a standing dino and into a jumping one.
export const KINDS: Kind[] = [
  { frames: [['..#..', '#.#.#', '#####', '..#..']], y: 0, ink: TREE },
  { frames: [['..#..', '#.#.#', '#.###', '###..', '..#..']], y: 0, ink: TREE },
  { frames: [BIRD_UP, BIRD_DOWN], y: 5, ink: BIRD },
  { frames: [BIRD_UP, BIRD_DOWN], y: 9, ink: BIRD },
]
const TREE_KINDS = [0, 1]
const BIRD_KINDS = [2, 3]

export type Obstacle = { x: number; kind: number }

export type Run = {
  phase: 'ready' | 'running' | 'over'
  y: number
  vy: number
  duck: number
  speed: number
  obstacles: Obstacle[]
  gap: number
  ticks: number
}

export function newRun(): Run {
  return { phase: 'ready', y: 0, vy: 0, duck: 0, speed: START_SPEED, obstacles: [], gap: 20, ticks: 0 }
}

export const scoreOf = (run: Run) => Math.floor(run.ticks / 2)

const isDucking = (run: Run) => run.duck > 0 && run.y === 0

export function dinoSprite(run: Run): string[] {
  const stride = Math.floor(run.ticks / STRIDE_TICKS) % 2 ? 'left' : 'right'
  if (isDucking(run)) return [...DUCK, ...DUCK_LEGS[stride]]
  const legs = run.phase !== 'running' || run.y > 0 ? 'still' : stride
  return [...STAND, ...STAND_LEGS[legs]]
}

export function obstacleSprite(o: Obstacle, ticks: number): string[] {
  const { frames } = KINDS[o.kind]!
  return frames[Math.floor(ticks / FLAP_TICKS) % frames.length]!
}

// Space or ↑ does it all: start a waiting run, jump from the ground, or run again after a crash.
export function jump(run: Run): Run {
  if (run.phase === 'over') return { ...newRun(), phase: 'running' }
  if (run.phase === 'ready') return { ...run, phase: 'running', vy: JUMP_V }
  return run.y === 0 ? { ...run, vy: JUMP_V, duck: 0 } : run
}

// On the ground ↓ ducks; in the air it drops the dino fast, as Chrome's does.
export function duck(run: Run): Run {
  if (run.phase !== 'running') return run
  return run.y > 0 ? { ...run, vy: Math.min(run.vy, -JUMP_V) } : { ...run, duck: DUCK_TICKS }
}

// Each '#' of a sprite whose bottom-left pixel sits at (x, y), as "x,height".
function pixelsOf(sprite: string[], x: number, y: number): Set<string> {
  const out = new Set<string>()
  sprite.forEach((line, r) => {
    for (let c = 0; c < line.length; c++) if (line[c] === '#') out.add(`${x + c},${y + sprite.length - 1 - r}`)
  })
  return out
}

const obstaclePixels = (o: Obstacle, ticks: number) =>
  pixelsOf(obstacleSprite(o, ticks), Math.floor(o.x), KINDS[o.kind]!.y)

// Pixel against pixel, so a crash is always one the player could see.
function hits(run: Run): boolean {
  const dino = pixelsOf(dinoSprite(run), DINO_X, Math.floor(run.y))
  return run.obstacles.some((o) => [...obstaclePixels(o, run.ticks)].some((p) => dino.has(p)))
}

export function step(run: Run, width: number, rand: () => number): Run {
  if (run.phase !== 'running') return run
  let y = run.y + run.vy
  let vy = run.vy - GRAVITY
  if (y <= 0) {
    y = 0
    vy = 0
  }
  const speed = Math.min(MAX_SPEED, run.speed + ACCEL)
  const obstacles = run.obstacles
    .map((o) => ({ ...o, x: o.x - speed }))
    .filter((o) => o.x + KINDS[o.kind]!.frames[0]![0]!.length > 0)
  let gap = run.gap - speed
  if (gap <= 0) {
    const pool = run.ticks >= BIRDS_AFTER && rand() < BIRD_CHANCE ? BIRD_KINDS : TREE_KINDS
    obstacles.push({ x: width, kind: pool[Math.floor(rand() * pool.length)]! })
    // Room to land and act again: a whole jump's run plus a few ticks, at the current speed.
    gap = speed * (JUMP_TICKS + 8) + rand() * GAP_SPREAD
  }
  const next: Run = { ...run, y, vy, duck: Math.max(0, run.duck - 1), speed, obstacles, gap, ticks: run.ticks + 1 }
  return hits(next) ? { ...next, phase: 'over' } : next
}

// FIELD_PX rows of pixels, top first.
export function pixelGridOf(run: Run, width: number): Ink[][] {
  const grid: Ink[][] = [...Array(FIELD_PX)].map(() => Array(width).fill(0))
  const paint = (pixels: Set<string>, ink: Ink) => {
    for (const p of pixels) {
      const [x, h] = p.split(',').map(Number) as [number, number]
      if (x >= 0 && x < width && h >= 0 && h < FIELD_PX) grid[FIELD_PX - 1 - h]![x] = ink
    }
  }
  for (const o of run.obstacles) paint(obstaclePixels(o, run.ticks), KINDS[o.kind]!.ink)
  paint(pixelsOf(dinoSprite(run), DINO_X, Math.floor(run.y)), DINO)
  return grid
}

export type Seg = { text: string; fg: Ink; bg: Ink }

// Two pixel rows to one text row, runs of one look merged into one segment.
export function textRowsOf(grid: Ink[][]): Seg[][] {
  const rows: Seg[][] = []
  for (let r = 0; r < grid.length; r += 2) {
    const segs: Seg[] = []
    grid[r]!.forEach((top, x) => {
      const bottom = grid[r + 1]![x]!
      const cell: Seg =
        top === 0 && bottom === 0
          ? { text: ' ', fg: 0, bg: 0 }
          : top === bottom
            ? { text: '█', fg: top, bg: 0 }
            : top === 0
              ? { text: '▄', fg: bottom, bg: 0 }
              : { text: '▀', fg: top, bg: bottom }
      const last = segs[segs.length - 1]
      if (last && last.fg === cell.fg && last.bg === cell.bg) last.text += cell.text
      else segs.push(cell)
    })
    rows.push(segs)
  }
  return rows
}
