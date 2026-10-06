# games

Mini games to play in a pane while Claude works: 2048, Minesweeper, Chrome's dino runner
and Gomoku, which you can play against the computer, a friend or whoever is waiting.
Everything happens in Claude Code's own UI, as one Claude Mod (`hooks/register.ts`), and
nothing a game shows enters the conversation.

| Command | Game | Needs the network |
|---|---|---|
| `/2048` | 2048 | No |
| `/mines` | Minesweeper, 9×9 with 10 mines | No |
| `/dino` | Chrome's offline dino runner | No |
| `/gomoku solo` | Gomoku against the computer | No |
| `/gomoku new`, `/gomoku join <code>`, `/gomoku match` | Gomoku against a person | Yes, the relay |

## Install

Add the marketplace once, then install the plugin:

```bash
/plugin marketplace add musingfox/cc-plugins
/plugin install games
```

Built and tested against Claude Code 2.1.291, in the terminal. The games draw in the
terminal and in the desktop app; `/dino` needs one of those two, since it runs inside a
`Client` element that other surfaces do not have.

## How every game behaves

- **Start it any time.** Each command runs even while Claude is still answering, so you
  can send a prompt and open a game right away.
- **The pane takes the keys** when it opens, as long as the prompt is empty. With text in
  the prompt, the pane opens without them.
- **Esc hands the keys back** to the prompt and leaves the game on screen. Running the
  game's command again takes the keys back, and the game is still where you left it.
- **`q` closes the pane.** 2048, Minesweeper and Gomoku keep their game for the rest of the
  session (Gomoku across sessions too); the dino run ends.
- **Letters, not arrows.** Board games move with `w` `a` `s` `d`: a pane's hotkeys take
  letters and digits only, and the arrow keys walk the pane's buttons.
- **Colours follow `/theme`.** Every colour is one of Claude Code's theme colours.

## 2048

`/2048` opens a 4×4 board. Slide the tiles; two equal tiles that meet merge into their
sum, and every slide adds a new 2 or 4. Reach 2048 to win, then keep going for a higher
score.

| Key | Does |
|---|---|
| `w` `a` `s` `d` | Slide up, left, down, right |
| `n` | New game |
| `q` | Close the pane |

The best score is kept across sessions.

## Minesweeper

`/mines` opens a 9×9 field with 10 mines. Dig every cell that is not a mine to win.

| Key | Does |
|---|---|
| `w` `a` `s` `d` | Move the cursor, drawn inverse |
| `e` | Dig the cell under the cursor |
| `f` | Flag or unflag it |
| `n` | New game |
| `q` | Close the pane |

- The first dig is always safe: the mines are laid after it, clear of that cell and its
  neighbours.
- Digging a shown number whose flags already match it digs the rest of its neighbours.
- The field is drawn in ASCII (`.` hidden, `F` flag, `*` mine), because characters of
  ambiguous width shift the columns in a terminal set up for CJK text.

## Dino

`/dino` opens Chrome's offline runner. **Click the pane once** before you play: the game
runs inside a `Client` element, which takes the keyboard only from a click.

| Key | Does |
|---|---|
| space, ↑ or `w` | Start, jump, or run again after a crash |
| ↓ or `s` | Duck on the ground; in the air, drop fast |
| Esc | Hand the keys back to the prompt |
| `q` | Close the pane, while the pane rather than the game holds the keys |

- The run waits for your first key, then speeds up the longer you last. The score counts
  ten a second, and the best one is kept across sessions.
- Cacti come from the start. After 20 seconds birds join them at two heights: a low bird
  hits a standing dino, so duck under it; a high bird flies over a standing dino and hits a
  jumping one.
- A terminal sends no key release, so a duck lasts half a second past the last ↓. Hold ↓
  and the key repeats, keeping the dino down.
- Crashes are tested pixel against pixel, so the dino dies only on a touch you can see.
- The field is pixel art in half blocks (`▀` `▄` `█`). A terminal set to draw those
  ambiguous-width characters two columns wide breaks the picture.

## Gomoku

Five or more of your stones in a row, across, down or diagonally, wins. The board is
15×15, black moves first, and the players take turns placing one stone each.

| Key | Does |
|---|---|
| `w` `a` `s` `d` | Move the cursor, drawn inverse |
| `e` | Place a stone on your turn |
| `q` | Close the pane; the game goes on |

The last stone placed is drawn highlighted. `/gomoku` reopens the pane, and
`/gomoku leave` gives up the current game (or stops looking for an opponent).

### Against the computer: `/gomoku solo`

You play black and move first; the computer answers each move at once. It plays offline,
with no relay and no network. It looks one move ahead: it completes its own five, blocks
your fours and open threes, and otherwise builds its longest lines. It is a fair opponent
for a game between prompts and can be beaten.

### With a friend: `/gomoku new` and `/gomoku join <code>`

1. Run `/gomoku new`. It opens a room, makes you black, and prints a line to send your
   friend: `/gomoku join <code>`.
2. Your friend, with the plugin installed, runs that command and takes white.
3. Play in turns. With your pane closed, a toast still says when your friend joins, moves
   or ends the game.

### With anyone: `/gomoku match`

`/gomoku match` waits for the next player who asks for a match on the same relay and
starts a game with them; black goes to either player at random. It waits up to 5 minutes,
and a toast says when someone joins. `/gomoku leave` stops looking.

You can only be in one game at a time: finish it or `/gomoku leave` before starting
another with `new`, `join`, `match` or `solo`.

### The relay

Games against a person pass their moves through a relay. The plugin uses the shared one at
**`https://games-relay.musingfox.com`** unless you set your own, so playing a friend or a
stranger needs no setup.

- **What it sees:** the room code, each player's display name, a random player id, and the
  board. It never sends one player's id to the other.
- **What it keeps:** a room lives until 15 minutes after its last move or join; then it is
  deleted and the game shows as closed. Waiting for a reply does not count as a move, so a
  player who takes more than 15 minutes over one move closes the game.
- **How often it is asked:** while you wait for your opponent, every 3 s with the pane open
  and every 30 s with it closed; never while it is your turn. While matching, every 3 s.
- Each client checks every move it receives and refuses one that is not a single legal
  stone. That catches slips, not an opponent who edits their copy of the plugin.

To run your own relay, on your Cloudflare account or on your own machine, see
[`relay/README.md`](relay/README.md); then point `relay_url` at it. Both players must use
the same relay.

### Settings

Set these in `/config`, under the games plugin.

| Option | Meaning |
|---|---|
| `relay_url` | The relay for games against a person. Empty means the shared relay. |
| `player_name` | The name your opponent sees. Empty means your login name. |
