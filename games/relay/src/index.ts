import { DurableObject } from 'cloudflare:workers'
import { emptyRoom, handle } from './room.ts'
import type { RoomState } from './room.ts'

type Env = { ROOMS: DurableObjectNamespace<Room> }

const ROOM_PATH = /^\/rooms\/([a-z0-9]{4,12})(?:\/([a-z]+))?$/

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

// Held in memory only: nothing is written to storage, so an evicted room starts empty and
// the clients seed it again.
export class Room extends DurableObject<Env> {
  private state: RoomState = emptyRoom()

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
    const [next, reply] = handle(this.state, request.method, action, url.searchParams, body)
    this.state = next
    return json(reply.status, reply.body)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const match = ROOM_PATH.exec(new URL(request.url).pathname)
    if (!match) return json(404, { error: 'not found' })
    return env.ROOMS.get(env.ROOMS.idFromName(match[1]!)).fetch(request)
  },
}
