import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { hasOpponent, isMyTurn, isOver, moveCursor, newGame, newSoloGame, place, playSolo, reconcile, SIZE, snapshotOf, STONES, winnerOf } from './gomoku.ts'
import type { View } from './gomoku.ts'
import type { Gomoku } from '../types'

const PANE = 'gomoku'
const STORE_GAME = 'gomoku'
const STORE_PLAYER = 'gomokuPlayer'
const TICK_MS = 3000
// With the pane closed the client polls every tenth tick, 30 s, to spend fewer requests.
const CLOSED_EVERY = 10
// The lobby drops a waiting player after 30 s without a call, so matching polls every tick.
const MATCH_TIMEOUT_MS = 5 * 60_000
const CODE = /^[a-z0-9]{4,12}$/
// What an empty relay_url means, so clearing the option in /config falls back to it.
export const SHARED_RELAY = 'https://games-relay.musingfox.com'

export type GomokuOptions = { relay_url?: string; player_name?: string }

export const COMMAND_GOMOKU = {
  name: 'gomoku',
  description: 'Play Gomoku against the computer, a friend or a stranger while Claude works',
  argumentHint: '[solo | new | join <code> | match | leave]',
  immediate: true,
} as const

const game = atom({ plugin: 'games', key: 'gomoku' } as const, null)
const matching = atom({ plugin: 'games', key: 'gomokuMatch' } as const, null)

const MOVES = [
  { dir: 'up', hotkey: 'w', glyph: '↑' },
  { dir: 'left', hotkey: 'a', glyph: '←' },
  { dir: 'down', hotkey: 's', glyph: '↓' },
  { dir: 'right', hotkey: 'd', glyph: '→' },
] as const

const GLYPHS: Record<string, string> = { '.': '·', x: '●', o: '○' }

type Reply = { status: number; view: View | null; data: Record<string, unknown> | null; error: string | null }

// Module state: a reload starts it over, and the next prompt or /gomoku starts polling again.
let relay = ''
let playerName = ''
let poll: { cancel(): void } | null = null
let ticks = 0
let isPaneOpen = false
let isBusy = false

async function remember($: EngineInterface, g: Gomoku | null) {
  await update($, game, () => g)
  try {
    await $.store.set(STORE_GAME, g)
  } catch {
    // The game still plays this session; only a restart would lose it.
  }
}

async function current($: EngineInterface): Promise<Gomoku | null> {
  const held = await read($, game)
  if (held) return held
  try {
    const stored = (await $.store.get(STORE_GAME)) as Gomoku | null | undefined
    if (stored) await update($, game, () => stored)
    return stored ?? null
  } catch {
    return null
  }
}

async function identity($: EngineInterface): Promise<{ player: string; name: string }> {
  let player: unknown = null
  try {
    player = await $.store.get(STORE_PLAYER)
  } catch {
    // A fresh id below; it only has to outlive this game.
  }
  if (typeof player !== 'string') {
    player = crypto.randomUUID()
    try {
      await $.store.set(STORE_PLAYER, player)
    } catch {
      // Kept for this session only.
    }
  }
  const name = playerName || (await $.env.get('USER')) || 'player'
  return { player: player as string, name }
}

async function call($: EngineInterface, method: 'GET' | 'POST', path: string, body?: object): Promise<Reply> {
  if (!relay) return { status: 0, view: null, data: null, error: 'No relay_url is set for the games plugin.' }
  try {
    const res = await $.http.fetch(`${relay}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = JSON.parse(res.text) as View & { error?: string; view?: View }
    if (res.ok) return { status: res.status, view: data, data, error: null }
    return { status: res.status, view: data.view ?? null, data, error: data.error ?? `relay answered ${res.status}` }
  } catch {
    return { status: 0, view: null, data: null, error: 'The relay could not be reached.' }
  }
}

function announce($: EngineInterface, before: Gomoku, after: Gomoku) {
  if (isPaneOpen) return
  const them = after.names[1 - after.seat] ?? 'Your friend'
  if (after.isClosed && !before.isClosed) $.ui.toast('Gomoku: the room closed after 15 minutes without a move.')
  else if (!hasOpponent(before) && hasOpponent(after)) $.ui.toast(`Gomoku: ${them} joined. /gomoku to play.`)
  else if (isOver(after) && !isOver(before)) $.ui.toast(`Gomoku: the game is over. /gomoku to see it.`)
  else if (isMyTurn(after) && !isMyTurn(before)) $.ui.toast(`Gomoku: ${them} moved. Your turn, /gomoku.`)
}

async function sendMove($: EngineInterface, g: Gomoku): Promise<Reply> {
  const me = await identity($)
  return call($, 'POST', `/rooms/${g.code}/move`, { player: me.player, seq: g.seq, snapshot: snapshotOf(g) })
}

// One round with the room: read it, and send again a move of this client's it missed.
async function sync($: EngineInterface) {
  const g = await current($)
  if (!g || isBusy) return
  isBusy = true
  try {
    const me = await identity($)
    let reply = await call($, 'GET', `/rooms/${g.code}?player=${me.player}`)
    if (!reply.view) return void (await remember($, { ...g, note: reply.error }))
    let step = reconcile(g, reply.view)
    if (step.send === 'move') {
      reply = await sendMove($, step.game)
      step = reply.view ? reconcile(step.game, reply.view) : { game: { ...step.game, note: reply.error }, send: 'none' }
    }
    const latest = (await current($)) ?? g
    // A move made while the round was out wins over what the room said before it.
    const after = latest.seq > g.seq ? latest : { ...step.game, cursor: latest.cursor }
    await remember($, after)
    announce($, g, after)
  } finally {
    isBusy = false
  }
}

// One call to the lobby while matching: still waiting, paired (then the game starts), or
// out of time.
async function lobbyRound($: EngineInterface) {
  const waiting = await read($, matching)
  if (!waiting || isBusy) return
  isBusy = true
  try {
    const me = await identity($)
    const timedOut = (await $.clock.now()) - waiting.since >= MATCH_TIMEOUT_MS
    if (timedOut) {
      await call($, 'POST', '/lobby/leave', { player: me.player })
      await update($, matching, () => null)
      if (!isPaneOpen) $.ui.toast('Gomoku: no opponent turned up in 5 minutes.')
      return
    }
    const reply = await call($, 'POST', '/lobby/match', me)
    const code = reply.data?.code
    if (typeof code !== 'string') return
    const room = await call($, 'GET', `/rooms/${code}?player=${me.player}`)
    if (!room.view || room.view.you === null) return
    const fresh = reconcile(newGame(code, room.view.you, room.view.names), room.view).game
    await remember($, fresh)
    await update($, matching, () => null)
    const them = fresh.names[1 - fresh.seat] ?? 'someone'
    if (!isPaneOpen) $.ui.toast(`Gomoku: matched with ${them}. /gomoku to play.`)
  } finally {
    isBusy = false
  }
}

function startPolling($: EngineInterface) {
  if (poll) return
  poll = $.clock.every(TICK_MS, async () => {
    ticks += 1
    if (await read($, matching)) return void (await lobbyRound($))
    if (!isPaneOpen && ticks % CLOSED_EVERY !== 0) return
    const g = await read($, game)
    if (!g || g.isSolo || g.isClosed || isOver(g)) return
    if (g.isSynced && isMyTurn(g)) return
    await sync($)
  })
}

async function play($: EngineInterface) {
  const g = await current($)
  if (g?.isSolo) {
    const answered = playSolo(g)
    if (answered) await remember($, answered)
    return
  }
  const moved = g && place(g)
  if (!g || !moved) return
  await remember($, moved)
  const reply = await sendMove($, moved)
  if (reply.view && reply.status === 200) await remember($, { ...moved, isSynced: true })
  // Refused or unreached, the move stays here and the next round sends it again or corrects it.
  else await sync($)
}

async function start($: EngineInterface, code: string, wanted?: 0 | 1): Promise<string | null> {
  const me = await identity($)
  const reply = await call($, 'POST', `/rooms/${code}/join`, { ...me, ...(wanted === undefined ? {} : { seat: wanted }) })
  if (!reply.view || reply.view.you === null) return reply.error ?? 'Could not join the room.'
  const fresh = newGame(code, reply.view.you, reply.view.names)
  await remember($, reconcile(fresh, reply.view).game)
  return null
}

async function openPane($: EngineInterface) {
  isPaneOpen = true
  await $.ui.open({ id: PANE, title: 'Gomoku', focus: true })
}

// A plugin's own $.ui.close runs only the hooks beneath it, so its ui.close hook never hears it.
async function closePane($: EngineInterface) {
  isPaneOpen = false
  await $.ui.close({ id: PANE })
}

export function registerGomoku(on: On, options: GomokuOptions) {
  relay = (options.relay_url || SHARED_RELAY).replace(/\/+$/, '')
  playerName = options.player_name ?? ''

  on('command.run', { command: 'gomoku' }, async ($, e) => {
    const [verb = '', arg = ''] = (e.args ?? '').trim().toLowerCase().split(/\s+/)
    if (verb === 'leave') {
      if (await read($, matching)) {
        await call($, 'POST', '/lobby/leave', { player: (await identity($)).player })
        await update($, matching, () => null)
      }
      await remember($, null)
      await closePane($)
      return { text: 'Left the Gomoku game.' }
    }
    if (verb === 'solo') {
      const g = await current($)
      if (g && !g.isSolo && !g.isClosed && !isOver(g)) return { text: 'Gomoku: finish this game first, or /gomoku leave.' }
      if (await read($, matching)) return { text: 'Gomoku: still looking for an opponent; /gomoku leave first.' }
      await remember($, newSoloGame((await identity($)).name))
      await openPane($)
      return {}
    }
    if (verb === 'match') {
      const g = await current($)
      if (g && !g.isSolo && !g.isClosed && !isOver(g)) return { text: 'Gomoku: finish this game first, or /gomoku leave.' }
      await remember($, null)
      const since = await $.clock.now()
      await update($, matching, () => ({ since }))
      startPolling($)
      await openPane($)
      await lobbyRound($)
      return {}
    }
    if (verb === 'new' || verb === 'join') {
      const g = await current($)
      if (g && !g.isSolo && !g.isClosed && !isOver(g)) return { text: 'Gomoku: finish this game first, or /gomoku leave.' }
      if (await read($, matching)) return { text: 'Gomoku: still looking for an opponent; /gomoku leave first.' }
      const code = verb === 'new' ? crypto.randomUUID().replace(/-/g, '').slice(0, 6) : arg
      if (!CODE.test(code)) return { text: 'usage: /gomoku join <code>, the code your friend got from /gomoku new' }
      const failed = await start($, code, verb === 'new' ? 0 : undefined)
      if (failed) return { text: `Gomoku: ${failed}` }
      startPolling($)
      await openPane($)
      return verb === 'new' ? { text: `Gomoku room ${code}. Send your friend: /gomoku join ${code}` } : {}
    }
    if (verb !== '') return { text: 'usage: /gomoku [solo | new | join <code> | match | leave]' }
    if (!(await current($)) && !(await read($, matching)))
      return {
        text: 'No Gomoku game yet. /gomoku solo plays the computer, /gomoku match finds an opponent, /gomoku new opens a room for a friend.',
      }
    startPolling($)
    await openPane($)
    void sync($)
    return {}
  })

  // A game left from an earlier session resumes polling with the first prompt.
  on('turn.start', async ($, e, next) => {
    if (!poll && (await current($))) startPolling($)
    return next(e)
  })

  // The person's own close (the engine's mark, ctrl+x x) arrives here.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    isPaneOpen = false
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    if (await read($, matching))
      return Box({
        flexDirection: 'column',
        children: [
          Box({ key: 'status', children: [Text({ children: ['Looking for an opponent…'] })] }),
          Text({ dimColor: true, children: ['A toast says when someone joins. /gomoku leave stops looking.'] }),
          Button({ key: 'close', label: 'close', hotkey: 'q', plain: true, onPress: () => closePane($) }),
        ],
      })
    const g = await read($, game)
    if (!g) return Text({ dimColor: true, children: ['No game. /gomoku solo, /gomoku match or /gomoku new starts one.'] })
    const me = g.names[g.seat] ?? 'you'
    const them = g.names[1 - g.seat]
    const winner = winnerOf(g)
    const status = g.isClosed
    ? { text: 'Closed. /gomoku new starts another game.' }
    : !hasOpponent(g)
      ? { text: `Waiting for a friend: /gomoku join ${g.code}` }
      : winner !== null
        ? winner === g.seat
          ? { text: 'You win!', color: 'success' }
          : { text: `${them} wins.`, color: 'error' }
        : isOver(g)
          ? { text: 'The board is full: a draw.' }
          : isMyTurn(g)
            ? { text: 'Your move: e places a stone.', color: 'success' }
            : { text: `${them}'s move…` }
    const rows = [...Array(SIZE).keys()].map((r) =>
      Box({
        key: `row:${r}`,
        children: [...Array(SIZE).keys()].map((c) => {
          const k = r * SIZE + c
          const cell = g.board[k]!
          return Text({
            inverse: k === g.cursor,
            color: k === g.last ? 'warning' : cell === '.' ? 'subtle' : undefined,
            bold: k === g.last,
            children: [` ${GLYPHS[cell]}`],
          })
        }),
      }),
    )
    const mine = GLYPHS[STONES[g.seat]]
    const theirs = GLYPHS[STONES[1 - g.seat]!]
    return Box({
      flexDirection: 'column',
      children: [
        Box({
          key: 'players',
          children: [Text({ children: [`${g.isSolo ? 'Solo' : `Room ${g.code}`}   ${mine} ${me} (you)   vs   ${theirs} ${them ?? '…'}`] })],
        }),
        Box({ key: 'status', children: [Text({ color: status.color, dimColor: !status.color, children: [status.text] })] }),
        ...(g.note ? [Text({ color: 'warning', children: [g.note] })] : []),
        Box({ flexDirection: 'column', children: rows }),
        Box({
          flexDirection: 'row',
          gap: 2,
          children: [
            ...MOVES.map((m) =>
              Button({
                key: m.dir,
                label: m.glyph,
                hotkey: m.hotkey,
                plain: true,
                onPress: () => update($, game, (x) => (x ? moveCursor(x, m.dir) : x)),
              }),
            ),
            Button({ key: 'place', label: 'place', hotkey: 'e', plain: true, onPress: () => play($) }),
            Button({ key: 'close', label: 'close', hotkey: 'q', plain: true, onPress: () => closePane($) }),
          ],
        }),
      ],
    })
  })
}
