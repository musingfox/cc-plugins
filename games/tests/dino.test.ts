import { describe, expect, test } from 'claude-code/testing'
import {
  BIRD,
  DINO,
  DINO_X,
  dinoSprite,
  duck,
  DUCK_TICKS,
  FIELD_PX,
  jump,
  KINDS,
  newRun,
  pixelGridOf,
  scoreOf,
  step,
  textRowsOf,
  TREE,
} from '../hooks/dino.ts'
import type { Ink, Run } from '../hooks/dino.ts'

const WIDTH = 60
const never = () => 0.99
const SPEEDS = [1.4, 2.8]
const TREE_KINDS = [0, 1]
const MID_BIRD = 2
const HIGH_BIRD = 3

function running(patch: Partial<Run> = {}): Run {
  return { ...newRun(), phase: 'running', gap: 1000, ...patch }
}

function steps(run: Run, n: number, each: (r: Run) => Run = (r) => r): Run {
  for (let i = 0; i < n; i++) run = step(each(run), WIDTH, never)
  return run
}

const passed = (run: Run) => run.phase === 'running' && run.obstacles.length === 0

describe('jump', () => {
  test('starts a waiting run with a jump', () => {
    const run = jump(newRun())
    expect(run.phase).toBe('running')
    expect(run.vy).toBeGreaterThan(0)
  })

  test('does nothing in the air', () => {
    const air = running({ y: 2, vy: 0.3 })
    expect(jump(air)).toBe(air)
  })

  test('after a crash runs again from the start', () => {
    const run = jump({ ...running({ ticks: 500 }), phase: 'over' })
    expect(run.phase).toBe('running')
    expect(run.ticks).toBe(0)
  })

  test('stays inside the field and lands', () => {
    let run = jump(running())
    let peak = 0
    for (let i = 0; i < 40; i++) {
      run = step(run, WIDTH, never)
      peak = Math.max(peak, run.y)
    }
    expect(peak).toBeGreaterThan(5)
    expect(Math.floor(peak) + dinoSprite(running()).length).toBeLessThanOrEqual(FIELD_PX)
    expect(run.y).toBe(0)
  })
})

describe('duck', () => {
  test('on the ground lowers the dino, and it stands again once the keys stop', () => {
    const low = duck(running())
    expect(dinoSprite(low).length).toBeLessThan(dinoSprite(running()).length)
    expect(dinoSprite(steps(low, DUCK_TICKS + 1)).length).toBe(dinoSprite(running()).length)
  })

  test('in the air drops the dino fast', () => {
    const air = running({ y: 6, vy: 0.5 })
    expect(duck(air).vy).toBeLessThan(0)
    const fall = (r: Run) => steps(r, 4).y
    expect(fall(duck(air))).toBeLessThan(fall(air))
  })

  test('a jump stands the dino up', () => {
    expect(jump(duck(running())).duck).toBe(0)
  })
})

describe('obstacles', () => {
  test('a tree reaching the dino on the ground crashes the run', () => {
    expect(steps(running({ obstacles: [{ x: DINO_X + 12, kind: 0 }] }), 20).phase).toBe('over')
  })

  test('a mid bird hits a standing dino', () => {
    expect(steps(running({ obstacles: [{ x: DINO_X + 12, kind: MID_BIRD }] }), 30).phase).toBe('over')
  })

  // Fairness: at the slowest and the fastest speed, each obstacle has a way past.
  for (const speed of SPEEDS) {
    for (const kind of TREE_KINDS)
      test(`tree ${kind} can be jumped at speed ${speed}`, () => {
        const cleared = [...Array(40).keys()].some((wait) => {
          const run = steps(running({ speed, obstacles: [{ x: DINO_X + 40, kind }] }), wait)
          return run.phase === 'running' && passed(steps(jump(run), 60))
        })
        expect(cleared).toBe(true)
      })

    test(`a mid bird can be ducked at speed ${speed}`, () => {
      const run = steps(running({ speed, obstacles: [{ x: DINO_X + 40, kind: MID_BIRD }] }), 80, duck)
      expect(passed(run)).toBe(true)
    })

    test(`a high bird passes over a standing dino at speed ${speed}`, () => {
      expect(passed(steps(running({ speed, obstacles: [{ x: DINO_X + 40, kind: HIGH_BIRD }] }), 80))).toBe(true)
    })
  }

  test('a jump into a high bird crashes', () => {
    const run = steps(jump(running({ obstacles: [{ x: DINO_X + 6, kind: HIGH_BIRD }] })), 20)
    expect(run.phase).toBe('over')
  })

  test('spawns a tree at the right edge once the gap runs out', () => {
    const run = step(running({ gap: 0.1 }), WIDTH, () => 0)
    expect(run.obstacles).toEqual([{ x: WIDTH, kind: 0 }])
    expect(run.gap).toBeGreaterThan(run.speed * 16)
  })

  test('birds come only after the run warms up', () => {
    const early = step(running({ gap: 0.1, ticks: 10 }), WIDTH, () => 0)
    expect(KINDS[early.obstacles[0]!.kind]!.ink).toBe(TREE)
    const late = step(running({ gap: 0.1, ticks: 1000 }), WIDTH, () => 0)
    expect(KINDS[late.obstacles[0]!.kind]!.ink).toBe(BIRD)
  })

  test('speeds up and scores with time', () => {
    const run = steps(running(), 100)
    expect(run.speed).toBeGreaterThan(running().speed)
    expect(scoreOf(run)).toBe(50)
  })

  test('the legs alternate while running and stay still in the air', () => {
    expect(dinoSprite(running({ ticks: 0 }))).not.toEqual(dinoSprite(running({ ticks: 3 })))
    expect(dinoSprite(running({ ticks: 0, y: 3 }))).toEqual(dinoSprite(running({ ticks: 3, y: 3 })))
  })
})

describe('drawing', () => {
  test('the pixel grid holds the dino on the ground, a tree and a bird', () => {
    const grid = pixelGridOf(running({ obstacles: [{ x: 30, kind: 1 }, { x: 45, kind: HIGH_BIRD }] }), WIDTH)
    expect(grid).toHaveLength(FIELD_PX)
    expect(grid.every((row) => row.length === WIDTH)).toBe(true)
    const bottom = grid[FIELD_PX - 1]!
    expect(bottom.slice(DINO_X, DINO_X + 10)).toContain(DINO)
    expect(bottom.slice(30, 35)).toContain(TREE)
    expect(grid.some((row) => row.slice(45, 53).includes(BIRD))).toBe(true)
  })

  test('two pixel rows become one row of half blocks, one segment per look', () => {
    const grid: Ink[][] = [
      [1, 1, 0, 2, 0],
      [1, 0, 1, 1, 0],
    ]
    const [row] = textRowsOf(grid)
    expect(row).toEqual([
      { text: '█▀▄', fg: 1, bg: 0 },
      { text: '▀', fg: 2, bg: 1 },
      { text: ' ', fg: 0, bg: 0 },
    ])
  })
})
