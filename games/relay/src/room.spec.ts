import { describe, expect, test } from 'bun:test'
import { emptyRoom, handle, join, MAX_SNAPSHOT, move, viewOf } from './room.ts'
import type { RoomState } from './room.ts'

const A = { player: 'player-a', name: 'Ann' }
const B = { player: 'player-b', name: 'Bob' }

function seated(): RoomState {
  const [one] = join(emptyRoom(), A)
  const [two] = join(one, B)
  return two
}

describe('join', () => {
  test('fills seat 0 then seat 1, and a third player is refused', () => {
    const [one, r1] = join(emptyRoom(), A)
    expect(r1).toEqual({ status: 200, body: { seq: 0, snapshot: null, names: ['Ann', null], you: 0 } })
    const [two, r2] = join(one, B)
    expect(r2.body).toMatchObject({ names: ['Ann', 'Bob'], you: 1 })
    const [, r3] = join(two, { player: 'player-c', name: 'Cy' })
    expect(r3).toEqual({ status: 409, body: { error: 'room full' } })
  })

  test('a seated player joining again keeps their seat', () => {
    const [, r] = join(seated(), { ...B, name: 'Bobby' })
    expect(r.body).toMatchObject({ you: 1, names: ['Ann', 'Bobby'] })
  })

  test('takes the wanted seat when it is free', () => {
    const [, r] = join(emptyRoom(), { ...B, seat: 1 })
    expect(r.body).toMatchObject({ you: 1, names: [null, 'Bob'] })
  })

  test('never shows one player the other player id', () => {
    expect(JSON.stringify(viewOf(seated(), A.player))).not.toContain(B.player)
  })
})

describe('move', () => {
  test('seat 0 makes the odd moves and seat 1 the even ones', () => {
    const [one, r1] = move(seated(), { player: A.player, seq: 1, snapshot: 's1' })
    expect(r1.body).toMatchObject({ seq: 1, snapshot: 's1' })
    const [, r2] = move(one, { player: B.player, seq: 2, snapshot: 's2' })
    expect(r2.body).toMatchObject({ seq: 2, snapshot: 's2' })
  })

  test('refuses a move out of turn, with the room as it stands', () => {
    const [, r] = move(seated(), { player: B.player, seq: 1, snapshot: 's1' })
    expect(r).toEqual({ status: 409, body: { error: 'not your turn', view: viewOf(seated(), B.player) } })
  })

  test('refuses a seq that is not the next one', () => {
    expect(move(seated(), { player: A.player, seq: 3, snapshot: 's' })[1].status).toBe(409)
  })

  test('refuses a player with no seat and an oversized snapshot', () => {
    expect(move(seated(), { player: 'x', seq: 1, snapshot: 's' })[1].status).toBe(403)
    expect(move(seated(), { player: A.player, seq: 1, snapshot: 'x'.repeat(MAX_SNAPSHOT + 1) })[1].status).toBe(413)
  })
})

describe('handle', () => {
  const q = (s = '') => new URLSearchParams(s)

  test('routes a read, a join and a move', () => {
    const [one] = handle(emptyRoom(), 'POST', 'join', q(), { player: A.player, name: 'Ann' })
    const [two] = handle(one, 'POST', 'join', q(), { player: B.player, name: 'Bob' })
    const [three, moved] = handle(two, 'POST', 'move', q(), { player: A.player, seq: 1, snapshot: 's1' })
    expect(moved.status).toBe(200)
    expect(handle(three, 'GET', '', q(`player=${B.player}`), null)[1].body).toMatchObject({ seq: 1, you: 1 })
  })

  test('refuses malformed input before it reaches the room', () => {
    expect(handle(emptyRoom(), 'GET', '', q('player=short'), null)[1].status).toBe(400)
    expect(handle(emptyRoom(), 'POST', 'join', q(), { player: 'player-a', seat: 2 })[1].status).toBe(400)
    expect(handle(seated(), 'POST', 'move', q(), { player: A.player, seq: 1.5, snapshot: 's' })[1].status).toBe(400)
    expect(handle(seated(), 'POST', 'seed', q(), { player: A.player, seq: 2, snapshot: 's' })[1].status).toBe(404)
    expect(handle(seated(), 'DELETE', '', q(), null)[1].status).toBe(405)
  })
})
