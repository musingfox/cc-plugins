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
