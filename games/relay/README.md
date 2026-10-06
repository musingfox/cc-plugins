# games relay

The Cloudflare Worker that passes `/gomoku` moves between two players. One Durable Object
per room code holds two seats, a move counter and the latest snapshot. It keeps them in its
storage, since an idle object hibernates after 10 s and forgets its memory, and an alarm
deletes the room 15 minutes after its last join or move. The protocol is `src/room.ts`,
tested in `src/room.spec.ts`.

The lobby is one more Durable Object, `src/lobby.ts`, for everyone. It holds one waiting
player; the next one to call `match` is paired with them, and the lobby seats both in a
fresh room before it answers. A waiting player who has not called for 30 s is dropped, and
a pairing the first player never picks up is forgotten after 5 minutes.

| Request | Body | Does |
|---|---|---|
| `GET /rooms/<code>?player=<id>` | | The room as that player sees it |
| `POST /rooms/<code>/join` | `player`, `name`, optional `seat` | Takes a seat, or keeps the one held |
| `POST /rooms/<code>/move` | `player`, `seq`, `snapshot` | The next move, in turn order |
| `POST /lobby/match` | `player`, `name` | Waits, or pairs with the waiting player: answers `{ waiting: true }` or the new room's `{ code }` |
| `POST /lobby/leave` | `player` | Stops waiting |

Run it on your own machine, then set `relay_url` to `http://localhost:5173` (`cf dev`
serves it on that port); only players who can reach that address can join:

```bash
cd games/relay && bun install && cf dev
```

The shared relay runs at `https://games-relay.musingfox.com`, which an empty `relay_url`
uses. To run your own, change `name` and `domains` in `cloudflare.config.ts` to a
domain on your account, deploy, and set that URL as `relay_url` in the games plugin's
`/config` on both players' machines:

```bash
cd games/relay && cf auth login && cf deploy
```

The Free plan's 100,000 requests a day cover roughly 200 twenty-minute games.
