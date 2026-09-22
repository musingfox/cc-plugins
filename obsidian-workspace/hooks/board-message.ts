export type BoardMessage = { kind: 'open'; path: string } | { kind: 'back' }

// A post is code's word, not the engine's: only the exact open or back shape from the pane's own list is acted on.
export function boardMessage(e: { requestId: string; element: string; data: unknown }, listed: string[] | null): BoardMessage | null {
  if (e.requestId !== 'obw-issue') return null
  if (e.element !== 'board') return null
  if (listed === null) return null
  const data = e.data
  if (typeof data !== 'object' || data === null) return null
  const keys = Object.keys(data)
  if (keys.length !== 1) return null
  const fields = data as Record<string, unknown>
  if (keys[0] === 'back') return fields.back === true ? { kind: 'back' } : null
  const path = listed.find((path) => path === fields.open)
  return path === undefined ? null : { kind: 'open', path }
}
