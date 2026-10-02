// The pane's keyboard decisions as pure functions: the kit cannot send a key, so each one is a table in ring.test.ts.

export const QUERY_KEY = 'query'

type Scroll = { origin: { kind: 'person' | 'plugin' }; pointer?: unknown; by: number }
type ListView = { isList: boolean; items: string[]; firstMatch: string | null; at: string | null }

// The key an arrow should put the ring on, or null to leave the press to the engine's scrolling:
// a wheel tick carries a pointer, a page key moves more than one row, and a card scrolls.
export function arrowMove(scroll: Scroll, view: ListView): string | null {
  if (scroll.origin.kind !== 'person' || scroll.pointer !== undefined || Math.abs(scroll.by) !== 1 || !view.isList) return null
  if (view.at === QUERY_KEY) return scroll.by > 0 ? view.firstMatch : null
  const index = view.at === null ? -1 : view.items.indexOf(view.at)
  if (index === -1) return scroll.by > 0 ? (view.items[0] ?? null) : null
  if (index === 0 && scroll.by < 0) return QUERY_KEY
  return view.items[index + scroll.by] ?? null
}

// Enter in the filter hands the ring to the first matching row, or to the first heading when that group is folded.
export function submitTarget(items: { key: string; kind: 'heading' | 'row' }[]): string | null {
  const [first, second] = items
  if (!first) return null
  return first.kind === 'heading' && second?.kind === 'row' ? second.key : first.key
}

export type Ring = { at: string | null; item: string | null }

// `item` is the last list item the ring held, which survives the ring moving onto a toolbar button.
export function nextRing(prev: Ring, element: string | undefined): Ring {
  return { at: element ?? null, item: element?.startsWith('group:') || element?.startsWith('row:') ? element : prev.item }
}

// After p or s, the card the ring was on, when it is still drawn.
export function reorderTarget(item: string | null, items: string[]): string | null {
  return item !== null && items.includes(item) ? item : null
}

// Where the ring goes when a card is left: `back` while another card remains, else the row the person opened.
export function backTarget(trail: string[], items: string[]): string | null {
  if (trail.length > 1) return 'back'
  if (trail.length === 0) return null
  const row = `row:${trail[0]}`
  return items.includes(row) ? row : (items[0] ?? null)
}

// Escape in a card is the person's close; it steps back instead, and a close the plugin or the unload asked for goes through.
export function closeGoesBack(origin: { kind: 'plugin' | 'person' | 'unload' }, trailLength: number): boolean {
  return origin.kind === 'person' && trailLength > 0
}
