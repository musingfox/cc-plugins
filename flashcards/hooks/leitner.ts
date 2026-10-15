import type { Box } from '../types'

// Days until a card in each box is due again, in milliseconds.
const INTERVAL: Record<Box, number> = { 1: 0, 2: 86_400_000, 3: 604_800_000 }

export function rate(entry: { box: Box; due: number } | undefined, rating: 1 | 2 | 3, now: number): { box: Box; due: number } {
  const current: Box = entry?.box ?? 1
  const box: Box = rating === 1 ? 1 : rating === 2 ? current : (Math.min(current + 1, 3) as Box)
  return { box, due: now + INTERVAL[box] }
}
