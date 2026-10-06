# games relay

The Cloudflare Worker that passes `/gomoku` moves between two players. One Durable Object
per room code holds two seats, a move counter and the latest snapshot. It keeps them in its
storage, since an idle object hibernates after 10 s and forgets its memory, and an alarm
deletes the room 15 minutes after its last join or move. The protocol is `src/room.ts`,
tested in `src/room.spec.ts`.

| Request | Body | Does |
|---|---|---|
| `GET /rooms/<code>?player=<id>` | | The room as that player sees it |
| `POST /rooms/<code>/join` | `player`, `name`, optional `seat` | Takes a seat, or keeps the one held |
| `POST /rooms/<code>/move` | `player`, `seq`, `snapshot` | The next move, in turn order |

Run it locally (`cf dev` serves it on port 5173):

```bash
cd games/relay && bun install && cf dev
```

Deploy it to your account, then set the printed `https://games-relay.<subdomain>.workers.dev`
as `relay_url` in the games plugin's `/config`:

```bash
cd games/relay && cf auth login && cf deploy
```

The Free plan's 100,000 requests a day cover roughly 200 twenty-minute games.
