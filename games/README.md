# games

Mini games to play while Claude works, as one Claude Mod (a function-hooks module,
`hooks/register.ts`). Nothing a game shows enters the conversation.

- **`/2048`**: opens a 2048 pane and gives it the keys.
- **`/mines`**: opens a 9×9 Minesweeper pane with 10 mines and gives it the keys.

Built and tested against Claude Code 2.1.291.

## 2048

`/2048` runs mid-turn, so you can start a game right after sending a prompt. The pane takes
the keys only while the composer is empty; with text in it, the pane opens without them.

| Key | Does |
|---|---|
| `w` `a` `s` `d` | Slide up, left, down, right |
| `n` | New game |
| `q` | Close the pane |
| Esc | Hand the keys back to the prompt; the board stays |

The arrow keys do not move tiles: a pane Button's hotkey takes only a letter or a digit, and
the arrows walk the pane's buttons. Running `/2048` again on an open pane asks for the keys
again and keeps the game; closing the pane keeps it too, for the rest of the session. The
best score is kept across sessions in the plugin's store.

Tiles take their colors from the Claude Code theme, so they follow `/theme`.

## Minesweeper

`/mines` behaves as `/2048` does: it runs mid-turn, Esc hands the keys back with the board
in place, and running it again asks for the keys again.

| Key | Does |
|---|---|
| `w` `a` `s` `d` | Move the cursor (drawn inverse) |
| `e` | Dig the cell under the cursor |
| `f` | Flag or unflag it |
| `n` | New game |
| `q` | Close the pane |

The first dig is always safe: the mines are laid after it, clear of that cell and its
neighbors. Digging a shown number whose flags already match it digs the rest of its
neighbors. The grid draws in ASCII (`.` hidden, `F` flag, `*` mine), because glyphs of
ambiguous width shift the columns in a CJK terminal.
