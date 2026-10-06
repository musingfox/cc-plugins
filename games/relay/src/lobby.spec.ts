import { describe, expect, test } from 'bun:test'
import { emptyLobby, handleLobby, leave, match, PICKUP_MS, WAIT_STALE_MS } from './lobby.ts'

const A = { player: 'player-a', name: 'Ann' }
const B = { player: 'player-b', name: 'Bob' }
const C = { player: 'player-c', name: 'Cy' }
const T = 1_000_000
const low = () => 0.1
const high = () => 0.9

describe('match', () => {
  test('the first player waits; the second is paired at once and the first picks it up', () => {
    const [one, r1, p1] = match(emptyLobby(), A, T, low)
    expect(r1.body).toEqual({ waiting: true })
    expect(p1).toBe(null)
    const [two, r2, pairing] = match(one, B, T + 1000, low)
    expect(pairing).toMatchObject({ black: { player: B.player, name: 'Bob' }, white: { player: A.player, name: 'Ann' } })
    expect(r2.body).toEqual({ code: pairing!.code })
    expect(pairing!.code).toMatch(/^[a-z0-9]{6}$/)
    const [three, r3] = match(two, A, T + 2000, low)
    expect(r3.body).toEqual({ code: pairing!.code })
    expect(three).toEqual(emptyLobby())
  })

  test('black goes to either player at random', () => {
    const [one] = match(emptyLobby(), A, T, low)
    expect(match(one, B, T, high)[2]).toMatchObject({ black: { player: A.player }, white: { player: B.player } })
  })

  test('a waiting player calling again keeps waiting, and is not paired with themselves', () => {
    const [one] = match(emptyLobby(), A, T, low)
    const [two, r, pairing] = match(one, A, T + 3000, low)
    expect(r.body).toEqual({ waiting: true })
    expect(pairing).toBe(null)
    expect(two.waiting?.at).toBe(T + 3000)
  })

  test('a waiter who stopped calling is dropped, and the next player waits instead', () => {
    const [one] = match(emptyLobby(), A, T, low)
    const [two, r, pairing] = match(one, B, T + WAIT_STALE_MS, low)
    expect(r.body).toEqual({ waiting: true })
    expect(pairing).toBe(null)
    expect(two.waiting?.player).toBe(B.player)
  })

  test('a pairing never picked up is forgotten', () => {
    const [one] = match(emptyLobby(), A, T, low)
    const [two] = match(one, B, T, low)
    const [, r] = match(two, A, T + PICKUP_MS, low)
    expect(r.body).toEqual({ waiting: true })
  })

  test('a third player waits for the next one', () => {
    const [one] = match(emptyLobby(), A, T, low)
    const [two] = match(one, B, T, low)
    expect(match(two, C, T, low)[1].body).toEqual({ waiting: true })
  })
})

describe('leave', () => {
  test('takes a waiting player out of the queue', () => {
    const [one] = match(emptyLobby(), A, T, low)
    const [two] = leave(one, A.player, T)
    expect(two.waiting).toBe(null)
    expect(match(two, B, T, low)[1].body).toEqual({ waiting: true })
  })

  test('leaves someone else waiting alone', () => {
    const [one] = match(emptyLobby(), A, T, low)
    expect(leave(one, B.player, T)[0].waiting?.player).toBe(A.player)
  })
})

describe('handleLobby', () => {
  test('refuses a bad player, a GET and an unknown action', () => {
    expect(handleLobby(emptyLobby(), 'POST', 'match', { player: 'x' }, T, low)[1].status).toBe(400)
    expect(handleLobby(emptyLobby(), 'GET', 'match', null, T, low)[1].status).toBe(405)
    expect(handleLobby(emptyLobby(), 'POST', 'nope', A, T, low)[1].status).toBe(404)
  })
})
