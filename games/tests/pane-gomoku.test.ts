import { describe, expect, mock, test } from 'claude-code/testing'
import { emptyLobby, handleLobby } from '../relay/src/lobby.ts'
import type { LobbyState } from '../relay/src/lobby.ts'
import { emptyRoom, handle } from '../relay/src/room.ts'
import type { RoomState } from '../relay/src/room.ts'
import { emptyBoard, SIZE } from '../hooks/gomoku.ts'
import { paneProps, run, SESSION } from './fixtures/world.ts'

const RELAY = 'https://relay.example.test'
const OPTIONS = { relay_url: RELAY, player_name: 'Ann' }
const BOB = { player: 'player-bob-0001', name: 'Bob' }
const CENTRE = Math.floor((SIZE * SIZE) / 2)

// The relay beneath the plugin is the real room logic, one room per code, so the test can
// act as the friend and as the platform evicting a room.
function world(on: any) {
  const rooms = new Map<string, RoomState>()
  let lobby: LobbyState = emptyLobby()
  // The lobby seats a pairing in its room, as the Worker does.
  const lobbyCall = (action: string, body: object) => {
    const [next, reply, pairing] = handleLobby(lobby, 'POST', action, body, Date.now(), Math.random)
    lobby = next
    if (pairing) {
      for (const [who, seat] of [[pairing.black, 0], [pairing.white, 1]] as const) {
        const [room] = handle(rooms.get(pairing.code) ?? emptyRoom(), 'POST', 'join', new URLSearchParams(), { ...who, seat })
        rooms.set(pairing.code, room)
      }
    }
    return reply
  }
  const seen = { opened: [] as any[], toasts: [] as string[], commands: [] as any[], isDown: false, requests: 0, urls: [] as string[] }
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  mock.store(on, {})
  mock.env(on, { USER: 'ann' })
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 7) })
  on('command.register', ($: any, e: any) => {
    seen.commands.push(e)
    return { value: { command: e.name } }
  })
  on('ui.open', ($: any, e: any) => {
    seen.opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', ($: any, e: any) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('http.fetch', ($: any, e: any) => {
    seen.requests += 1
    seen.urls.push(e.url)
    if (seen.isDown) throw new Error('offline')
    const url = new URL(e.url)
    const [, kind, code, action = ''] = url.pathname.split('/')
    const body = e.init?.body ? JSON.parse(e.init.body) : null
    if (kind === 'lobby') {
      const reply = lobbyCall(code!, body)
      return { value: { status: reply.status, ok: reply.status === 200, headers: {}, text: JSON.stringify(reply.body) } }
    }
    const [next, reply] = handle(rooms.get(code!) ?? emptyRoom(), e.init?.method ?? 'GET', action, url.searchParams, body)
    rooms.set(code!, next)
    const value = { status: reply.status, ok: reply.status === 200, headers: {}, text: JSON.stringify(reply.body) }
    return { value }
  })
  // The friend's side, straight against the room.
  const friend = (code: string, action: string, body: object) => {
    const [next, reply] = handle(rooms.get(code) ?? emptyRoom(), 'POST', action, new URLSearchParams(), { ...BOB, ...body })
    rooms.set(code, next)
    return reply
  }
  const stranger = (action: string) => lobbyCall(action, BOB)
  return { rooms, seen, clock, friend, stranger, lobby: () => lobby }
}

async function opened($: any, ui: any) {
  return $.ui.mount({ plugin: 'games', surface: ui, component: 'Pane', requestId: 'gomoku', props: paneProps('Gomoku') })
}

const text = async (ui: any, key: string) => (await ui.find({ key }))?.text as string | undefined

function snapshotWith(stones: [number, string][], last: number) {
  const cells = emptyBoard().split('')
  for (const [k, s] of stones) cells[k] = s
  return JSON.stringify({ board: cells.join(''), last })
}

describe('/gomoku', () => {
  test('registers a command that runs mid-turn', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(w.seen.commands).toContainEqual(expect.objectContaining({ name: 'gomoku', immediate: true }))
  })

  test('new opens a room as black and waits for a friend', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = await $.command.run({ ...run('gomoku'), args: 'new' })
    const code = /room ([a-z0-9]+)/.exec(out.text ?? '')?.[1]!
    expect(out.text).toBe(`Gomoku room ${code}. Send your friend: /gomoku join ${code}`)
    expect(w.seen.opened).toEqual([expect.objectContaining({ id: 'gomoku', focus: true })])
    expect(w.rooms.get(code)?.seats[0]?.name).toBe('Ann')
    const ui = await opened($, 'terminal')
    expect(await text(ui, 'status')).toBe(`Waiting for a friend: /gomoku join ${code}`)
  })

  test('a game plays out: join, move, answer, and the friend sees each stone', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = await $.command.run({ ...run('gomoku'), args: 'new' })
    const code = /room ([a-z0-9]+)/.exec(out.text ?? '')?.[1]!
    const ui = await opened($, 'terminal')
    w.friend(code, 'join', {})
    await w.clock.advance(3000)
    expect(await text(ui, 'players')).toContain('vs   ○ Bob')
    expect(await text(ui, 'status')).toBe('Your move: e places a stone.')

    await ui.press({ key: 'place' })
    const room = w.rooms.get(code)!
    expect(room.seq).toBe(1)
    expect(JSON.parse(room.snapshot!).board[CENTRE]).toBe('x')
    expect(await text(ui, 'status')).toBe("Bob's move…")

    w.friend(code, 'move', { seq: 2, snapshot: snapshotWith([[CENTRE, 'x'], [0, 'o']], 0) })
    await w.clock.advance(3000)
    expect((await text(ui, 'row:0'))?.trim().startsWith('○')).toBe(true)
    expect(await text(ui, 'status')).toBe('Your move: e places a stone.')
  })

  test('a move the relay never got is sent again on the next round', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = await $.command.run({ ...run('gomoku'), args: 'new' })
    const code = /room ([a-z0-9]+)/.exec(out.text ?? '')?.[1]!
    const ui = await opened($, 'terminal')
    w.friend(code, 'join', {})
    await w.clock.advance(3000)
    w.seen.isDown = true
    await ui.press({ key: 'place' })
    expect(w.rooms.get(code)!.seq).toBe(0)
    w.seen.isDown = false
    await w.clock.advance(3000)
    expect(w.rooms.get(code)!.seq).toBe(1)
    expect(await text(ui, 'status')).toBe("Bob's move…")
  })

  test('a room that closed says so and stops the game', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = await $.command.run({ ...run('gomoku'), args: 'new' })
    const code = /room ([a-z0-9]+)/.exec(out.text ?? '')?.[1]!
    const ui = await opened($, 'terminal')
    w.friend(code, 'join', {})
    await w.clock.advance(3000)
    await ui.press({ key: 'place' })
    w.rooms.delete(code)
    await w.clock.advance(3000)
    expect(await text(ui, 'status')).toBe('Closed. /gomoku new starts another game.')
    expect(await ui.find({ text: /closed after 15 minutes/ })).toBeDefined()
    const asked = w.seen.requests
    await w.clock.advance(30000)
    expect(w.seen.requests).toBe(asked)
  })

  test('with the pane closed, a friend move polls slower and arrives as a toast', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = await $.command.run({ ...run('gomoku'), args: 'new' })
    const code = /room ([a-z0-9]+)/.exec(out.text ?? '')?.[1]!
    const ui = await opened($, 'terminal')
    w.friend(code, 'join', {})
    await w.clock.advance(3000)
    await ui.press({ key: 'place' })
    await ui.press({ key: 'close' })
    w.friend(code, 'move', { seq: 2, snapshot: snapshotWith([[CENTRE, 'x'], [0, 'o']], 0) })
    await w.clock.advance(3000)
    expect(w.seen.toasts).toEqual([])
    await w.clock.advance(27000)
    expect(w.seen.toasts).toEqual(['Gomoku: Bob moved. Your turn, /gomoku.'])
  })

  test('a friend move that breaks the rules is refused', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = await $.command.run({ ...run('gomoku'), args: 'new' })
    const code = /room ([a-z0-9]+)/.exec(out.text ?? '')?.[1]!
    const ui = await opened($, 'terminal')
    w.friend(code, 'join', {})
    await w.clock.advance(3000)
    await ui.press({ key: 'place' })
    w.friend(code, 'move', { seq: 2, snapshot: snapshotWith([[CENTRE, 'x'], [0, 'o'], [1, 'o']], 1) })
    await w.clock.advance(3000)
    expect(await ui.find({ text: /Refused a move/ })).toBeDefined()
    expect((await text(ui, 'row:0'))?.includes('○')).toBe(false)
  })

  test('five in a row wins', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = await $.command.run({ ...run('gomoku'), args: 'new' })
    const code = /room ([a-z0-9]+)/.exec(out.text ?? '')?.[1]!
    const ui = await opened($, 'terminal')
    w.friend(code, 'join', {})
    const stones: [number, string][] = []
    for (let i = 0; i < 4; i++) {
      await w.clock.advance(3000)
      await ui.press({ key: 'place' })
      await ui.press({ key: 'right' })
      stones.push([CENTRE + i, 'x'], [i, 'o'])
      w.friend(code, 'move', { seq: 2 * i + 2, snapshot: snapshotWith(stones, i) })
    }
    await w.clock.advance(3000)
    await ui.press({ key: 'place' })
    expect(await text(ui, 'status')).toBe('You win!')
  })

  test('join takes the free seat; a full room is refused', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    w.friend('room01', 'join', {})
    expect(await $.command.run({ ...run('gomoku'), args: 'join room01' })).toEqual({})
    expect(w.rooms.get('room01')?.seats[1]?.name).toBe('Ann')
    await $.command.run({ ...run('gomoku'), args: 'leave' })
    w.rooms.set('full01', { seats: [{ player: 'p-one-000', name: 'X' }, { player: 'p-two-000', name: 'Y' }], seq: 0, snapshot: null })
    expect((await $.command.run({ ...run('gomoku'), args: 'join full01' })).text).toBe('Gomoku: room full')
  })

  test('an unreachable relay says so in the pane', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const out = await $.command.run({ ...run('gomoku'), args: 'new' })
    expect(out.text).toMatch(/^Gomoku room/)
    const ui = await opened($, 'terminal')
    w.seen.isDown = true
    await w.clock.advance(3000)
    expect(await ui.find({ text: /relay could not be reached/ })).toBeDefined()
  })

  test('a bad code and an unknown verb answer the usage', { options: OPTIONS }, async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    expect((await $.command.run({ ...run('gomoku'), args: 'join X!' })).text).toMatch(/^usage/)
    expect((await $.command.run({ ...run('gomoku'), args: 'play' })).text).toMatch(/^usage/)
    expect((await $.command.run(run('gomoku'))).text).toBe(
      'No Gomoku game yet. /gomoku solo plays the computer, /gomoku match finds an opponent, /gomoku new opens a room for a friend.',
    )
  })

  test('match waits in the lobby, and a stranger arriving starts the game with a toast', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(await $.command.run({ ...run('gomoku'), args: 'match' })).toEqual({})
    const ui = await opened($, 'terminal')
    expect(await text(ui, 'status')).toBe('Looking for an opponent…')
    expect(w.lobby().waiting?.name).toBe('Ann')
    await ui.press({ key: 'close' })
    const paired = w.stranger('match').body as { code: string }
    await w.clock.advance(3000)
    expect(w.seen.toasts).toEqual(['Gomoku: matched with Bob. /gomoku to play.'])
    const players = await text(ui, 'players')
    expect(players).toMatch(new RegExp(`^Room ${paired.code} .* Ann \\(you\\) +vs +[●○] Bob$`))
  })

  test('match gives up after 5 minutes alone', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.command.run({ ...run('gomoku'), args: 'match' })
    const ui = await opened($, 'terminal')
    await ui.press({ key: 'close' })
    await w.clock.advance(5 * 60_000)
    expect(w.seen.toasts).toEqual(['Gomoku: no opponent turned up in 5 minutes.'])
    expect(w.lobby().waiting).toBe(null)
    expect(await ui.find({ text: /No game/ })).toBeDefined()
  })

  test('leave takes the player out of the lobby', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.command.run({ ...run('gomoku'), args: 'match' })
    expect(w.lobby().waiting?.name).toBe('Ann')
    await $.command.run({ ...run('gomoku'), args: 'leave' })
    expect(w.lobby().waiting).toBe(null)
  })

  test('match is refused while a game is still on', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.command.run({ ...run('gomoku'), args: 'new' })
    expect((await $.command.run({ ...run('gomoku'), args: 'match' })).text).toBe('Gomoku: finish this game first, or /gomoku leave.')
    expect(w.lobby().waiting).toBe(null)
  })

  test('solo plays the computer with no relay at all', { options: OPTIONS }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(await $.command.run({ ...run('gomoku'), args: 'solo' })).toEqual({})
    const ui = await opened($, 'terminal')
    expect(await text(ui, 'players')).toBe('Solo   ● Ann (you)   vs   ○ Computer')
    await ui.press({ key: 'place' })
    const stones = (await Promise.all([...Array(SIZE).keys()].map((r) => text(ui, `row:${r}`)))).join('')
    expect([...stones].filter((c) => c === '●')).toHaveLength(1)
    expect([...stones].filter((c) => c === '○')).toHaveLength(1)
    expect(await text(ui, 'status')).toBe('Your move: e places a stone.')
    await w.clock.advance(30000)
    expect(w.seen.requests).toBe(0)
  })

  test('an empty relay_url uses the shared relay', { options: { relay_url: '', player_name: 'Ann' } }, async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.command.run({ ...run('gomoku'), args: 'new' })
    expect(w.seen.urls[0]).toMatch(/^https:\/\/games-relay\.musingfox\.com\/rooms\/[a-z0-9]{6}\/join$/)
  })

  test('new and join are refused while a game is still on', { options: OPTIONS }, async ($, on) => {
    world(on)
    await $.session.start(SESSION)
    await $.command.run({ ...run('gomoku'), args: 'new' })
    const refused = 'Gomoku: finish this game first, or /gomoku leave.'
    expect((await $.command.run({ ...run('gomoku'), args: 'new' })).text).toBe(refused)
    expect((await $.command.run({ ...run('gomoku'), args: 'join abcd12' })).text).toBe(refused)
  })
})
