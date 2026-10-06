// One room of a two-player turn relay. The room only passes snapshots along: each client
// keeps the whole game and checks the rules.

export type Seat = { player: string; name: string } | null

export type RoomState = { seats: [Seat, Seat]; seq: number; snapshot: string | null }

export type View = { seq: number; snapshot: string | null; names: [string | null, string | null]; you: 0 | 1 | null }

export type Reply = { status: number; body: View | { error: string; view?: View } }

export const MAX_SNAPSHOT = 4096
const MAX_NAME = 32

export const emptyRoom = (): RoomState => ({ seats: [null, null], seq: 0, snapshot: null })

const seatOf = (state: RoomState, player: string): 0 | 1 | null =>
  state.seats[0]?.player === player ? 0 : state.seats[1]?.player === player ? 1 : null

export function viewOf(state: RoomState, player: string): View {
  return {
    seq: state.seq,
    snapshot: state.snapshot,
    names: [state.seats[0]?.name ?? null, state.seats[1]?.name ?? null],
    you: seatOf(state, player),
  }
}

const ok = (state: RoomState, player: string): Reply => ({ status: 200, body: viewOf(state, player) })
const refuse = (status: number, error: string, view?: View): Reply => ({ status, body: { error, ...(view ? { view } : {}) } })

function withSeat(state: RoomState, seat: 0 | 1, player: string, name: string): RoomState {
  const seats: [Seat, Seat] = [...state.seats]
  seats[seat] = { player, name: name.slice(0, MAX_NAME) }
  return { ...state, seats }
}

// A seated player keeps their seat; otherwise the wanted seat if free, else any free one.
export function join(state: RoomState, a: { player: string; name: string; seat?: 0 | 1 }): [RoomState, Reply] {
  const held = seatOf(state, a.player)
  const free = ([0, 1] as const).filter((s) => state.seats[s] === null)
  const seat = held ?? (a.seat !== undefined && free.includes(a.seat) ? a.seat : free[0])
  if (seat === undefined) return [state, refuse(409, 'room full')]
  const next = withSeat(state, seat, a.player, a.name)
  return [next, ok(next, a.player)]
}

// seq counts the moves made; seat 0 makes moves 1, 3, 5, ...
export function move(state: RoomState, a: { player: string; seq: number; snapshot: string }): [RoomState, Reply] {
  const seat = seatOf(state, a.player)
  if (seat === null) return [state, refuse(403, 'not seated')]
  if (a.snapshot.length > MAX_SNAPSHOT) return [state, refuse(413, 'snapshot too large')]
  if (a.seq !== state.seq + 1) return [state, refuse(409, 'stale seq', viewOf(state, a.player))]
  if ((a.seq - 1) % 2 !== seat) return [state, refuse(409, 'not your turn', viewOf(state, a.player))]
  const next = { ...state, seq: a.seq, snapshot: a.snapshot }
  return [next, ok(next, a.player)]
}

const PLAYER = /^[A-Za-z0-9_-]{8,64}$/

const isSeat = (v: unknown): v is 0 | 1 => v === 0 || v === 1
const isSeq = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 100_000

// One request against the room: `action` is the path after the room code ('' for a read).
export function handle(
  state: RoomState,
  method: string,
  action: string,
  query: URLSearchParams,
  body: unknown,
): [RoomState, Reply] {
  if (method === 'GET' && action === '') {
    const player = query.get('player') ?? ''
    return PLAYER.test(player) ? [state, ok(state, player)] : [state, refuse(400, 'bad player')]
  }
  if (method !== 'POST') return [state, refuse(405, 'method not allowed')]
  const b = (body ?? {}) as Record<string, unknown>
  if (typeof b.player !== 'string' || !PLAYER.test(b.player)) return [state, refuse(400, 'bad player')]
  const name = typeof b.name === 'string' ? b.name : ''
  const snapshot = typeof b.snapshot === 'string' ? b.snapshot : null
  if (action === 'join') {
    if (b.seat !== undefined && !isSeat(b.seat)) return [state, refuse(400, 'bad seat')]
    return join(state, { player: b.player, name, seat: b.seat })
  }
  if (!isSeq(b.seq) || snapshot === null) return [state, refuse(400, 'bad seq or snapshot')]
  if (action === 'move') return move(state, { player: b.player, seq: b.seq, snapshot })
  return [state, refuse(404, 'no such action')]
}
