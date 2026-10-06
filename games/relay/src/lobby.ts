// The matchmaking lobby: one waiting player at a time, paired with the next one to arrive.
// A waiting player calls `match` again every few seconds; one who stops is dropped, and a
// pairing the first player has not picked up yet is kept for them a while.

export const WAIT_STALE_MS = 30_000
export const PICKUP_MS = 5 * 60_000

type Waiter = { player: string; name: string; at: number }

export type LobbyState = { waiting: Waiter | null; matched: Record<string, { code: string; at: number }> }

export type Pairing = { code: string; black: { player: string; name: string }; white: { player: string; name: string } }

export type LobbyReply = { status: number; body: { code: string } | { waiting: true } | { left: true } | { error: string } }

const PLAYER = /^[A-Za-z0-9_-]{8,64}$/
const CODE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

export const emptyLobby = (): LobbyState => ({ waiting: null, matched: {} })

function pruned(state: LobbyState, now: number): LobbyState {
  const matched = Object.fromEntries(Object.entries(state.matched).filter(([, m]) => now - m.at < PICKUP_MS))
  const waiting = state.waiting && now - state.waiting.at < WAIT_STALE_MS ? state.waiting : null
  return { waiting, matched }
}

export function codeOf(rand: () => number): string {
  return [...Array(6)].map(() => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join('')
}

// A pairing names the room to open; the caller seats both players in it before replying.
export function match(
  state: LobbyState,
  a: { player: string; name: string },
  now: number,
  rand: () => number,
): [LobbyState, LobbyReply, Pairing | null] {
  const s = pruned(state, now)
  const picked = s.matched[a.player]
  if (picked) {
    const { [a.player]: _, ...rest } = s.matched
    return [{ ...s, matched: rest }, { status: 200, body: { code: picked.code } }, null]
  }
  const other = s.waiting
  if (!other || other.player === a.player) {
    return [{ ...s, waiting: { player: a.player, name: a.name.slice(0, 32), at: now } }, { status: 200, body: { waiting: true } }, null]
  }
  const code = codeOf(rand)
  const me = { player: a.player, name: a.name.slice(0, 32) }
  const them = { player: other.player, name: other.name }
  const [black, white] = rand() < 0.5 ? [me, them] : [them, me]
  const next = { waiting: null, matched: { ...s.matched, [other.player]: { code, at: now } } }
  return [next, { status: 200, body: { code } }, { code, black, white }]
}

export function leave(state: LobbyState, player: string, now: number): [LobbyState, LobbyReply] {
  const s = pruned(state, now)
  const { [player]: _, ...matched } = s.matched
  const waiting = s.waiting?.player === player ? null : s.waiting
  return [{ waiting, matched }, { status: 200, body: { left: true } }]
}

export function handleLobby(
  state: LobbyState,
  method: string,
  action: string,
  body: unknown,
  now: number,
  rand: () => number,
): [LobbyState, LobbyReply, Pairing | null] {
  if (method !== 'POST') return [state, { status: 405, body: { error: 'method not allowed' } }, null]
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.player !== 'string' || !PLAYER.test(b.player)) return [state, { status: 400, body: { error: 'bad player' } }, null]
  if (action === 'match') return match(state, { player: b.player, name: typeof b.name === 'string' ? b.name : '' }, now, rand)
  if (action === 'leave') return [...leave(state, b.player, now), null]
  return [state, { status: 404, body: { error: 'no such action' } }, null]
}
