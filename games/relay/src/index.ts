import { DurableObject } from 'cloudflare:workers'
import { emptyLobby, handleLobby } from './lobby.ts'
import type { LobbyState } from './lobby.ts'
import { emptyRoom, handle } from './room.ts'
import type { RoomState } from './room.ts'

type Env = { ROOMS: DurableObjectNamespace<Room>; LOBBY: DurableObjectNamespace<Lobby> }

const ROOM_PATH = /^\/rooms\/([a-z0-9]{4,12})(?:\/([a-z]+))?$/
const LOBBY_PATH = /^\/lobby\/([a-z]+)$/

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// An idle Durable Object hibernates after 10 s and drops its memory, so the room lives in
// its storage. A room with no join or move for ROOM_TTL_MS is deleted; polls do not count.
const ROOM_TTL_MS = 15 * 60_000
const KEY = 'room'

export class Room extends DurableObject<Env> {
  private state: RoomState | null = null

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const [, , action = ''] = ROOM_PATH.exec(url.pathname) ?? []
    let body: unknown = null
    if (request.method === 'POST') {
      try {
        body = await request.json()
      } catch {
        return json(400, { error: 'body is not JSON' })
      }
    }
    const before = (this.state ??= (await this.ctx.storage.get<RoomState>(KEY)) ?? emptyRoom())
    const [next, reply] = handle(before, request.method, action, url.searchParams, body)
    if (next !== before) {
      this.state = next
      await this.ctx.storage.put(KEY, next)
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS)
    }
    return json(reply.status, reply.body)
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
    this.state = emptyRoom()
  }
}

const roomOf = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code))

// One lobby for everyone. It pairs two waiting players and seats them in a fresh room before
// it answers, so both find their seats when they open it.
export class Lobby extends DurableObject<Env> {
  private state: LobbyState | null = null

  async fetch(request: Request): Promise<Response> {
    const [, action = ''] = LOBBY_PATH.exec(new URL(request.url).pathname) ?? []
    let body: unknown = null
    try {
      body = request.method === 'POST' ? await request.json() : null
    } catch {
      return json(400, { error: 'body is not JSON' })
    }
    const before = (this.state ??= (await this.ctx.storage.get<LobbyState>(KEY)) ?? emptyLobby())
    const [next, reply, pairing] = handleLobby(before, request.method, action, body, Date.now(), Math.random)
    if (pairing) {
      const room = roomOf(this.env, pairing.code)
      const seat = (who: { player: string; name: string }, n: 0 | 1) =>
        room.fetch(`https://relay/rooms/${pairing.code}/join`, { method: 'POST', body: JSON.stringify({ ...who, seat: n }) })
      await seat(pairing.black, 0)
      await seat(pairing.white, 1)
    }
    if (next !== before) {
      this.state = next
      await this.ctx.storage.put(KEY, next)
    }
    return json(reply.status, reply.body)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname
    if (LOBBY_PATH.test(path)) return env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch(request)
    const room = ROOM_PATH.exec(path)
    if (!room) return json(404, { error: 'not found' })
    return roomOf(env, room[1]!).fetch(request)
  },
}
