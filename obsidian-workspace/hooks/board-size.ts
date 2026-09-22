import { displayWidth } from './width.ts'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const positive = (value: unknown, fallback: number) => (Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback)

// The one row reserved is the collapsed views Select, assumed to draw on a single line.
export function boardSize({ bodyRows, bodyColumns, siblings, argumentCard }: {
  bodyRows: unknown
  bodyColumns: unknown
  siblings: string[]
  argumentCard: boolean
}) {
  const columns = clamp(positive(bodyColumns, 80), 20, 300)
  const siblingRows = siblings
    .flatMap((line) => line.split('\n'))
    .reduce((sum, segment) => sum + Math.max(1, Math.ceil(displayWidth(segment) / columns)), 0)
  const rows = clamp(positive(bodyRows, 24) - 1 - siblingRows, 3, 150)
  return { rows: argumentCard ? Math.min(rows, 8) : rows, columns }
}
