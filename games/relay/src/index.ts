import { DurableObject } from 'cloudflare:workers'
import { emptyRoom, handle } from './room.ts'
import type { RoomState } from './room.ts'

type Env = { ROOMS: DurableObjectNamespace<Room> }

const ROOM_PATH = /^\/rooms\/([a-z0-9]{4,12})(?:\/([a-z]+))?$/

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const match = ROOM_PATH.exec(new URL(request.url).pathname)
    if (!match) return json(404, { error: 'not found' })
    return env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(request)
  },
}
