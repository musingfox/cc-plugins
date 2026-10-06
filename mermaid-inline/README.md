# mermaid-inline

Every ```` ```mermaid ```` block Claude writes is drawn as plain box art where the fence
was in the transcript, as one Claude Mod (a function-hooks module, `hooks/register.ts`).
The plugin draws locally and costs no tokens; the stored message is unchanged.

- **Drawn:** flowchart, sequence, class, state and xychart. A top-down flowchart or state
  diagram is laid out left to right when that fits and loses no label, and a state
  diagram's `[*]` start and end are left out.
- **Kept as written:** every other kind (gantt, pie, mindmap, …), ER (the renderer
  mangles its relationship edges), a source over 12,000 characters, and a block the
  renderer fails on.
- **Wide characters:** CJK and other East Asian Wide or Fullwidth characters count as two
  columns, so box borders line up around them.

Needs Claude Code 2.1.287 or later, where Claude Mods are on by default, and an
interactive session. Built and tested against Claude Code 2.1.289.

## Commands

- `/mermaid-inline` answers the current settings.
- `/mermaid-inline ascii on|off` switches to plain ASCII art, for a font without
  box-drawing characters. Default off.
- `/mermaid-inline lr on|off` allows or forbids the sideways layout. Default on.
- `/mermaid-inline open` writes the diagrams the transcript had to cut to an HTML page in
  `$TMPDIR` and opens it in the browser, where mermaid itself draws them (from the
  jsDelivr CDN).
- `/mermaid-inline reset` restores the defaults.

A diagram wider than the transcript is drawn again with the renderer's tightest padding,
which is often a third of the width and half the height. One that still does not fit is
cut at the edge, and its last line points to `/mermaid-inline open`.

Settings are kept in the plugin's store under the key `prefs` and read at session start.

## What this fork changes

Forked from [claude-mermaid](https://github.com/galElmalah/claude-mermaid) by Gal Elmalah
at commit `b19a0f0d09bf214c010b15cc2849c0c1a11d7b0d` (plugin version 0.3.1).

- **Renamed.** `claude-mermaid` fails `claude plugin validate`: names starting with
  `claude-` are reserved. The command is `/mermaid-inline`.
- **No colour.** Upstream wrote ANSI escapes into the rewritten message by default, and
  the engine skips a `ui.render` rewrite that carries escape sequences, so the terminal
  showed the raw fence. The art is now plain text, and the `color` setting is gone.
- **Wide characters.** The renderer sizes boxes by string length. Each wide character
  goes into the renderer as two narrow stand-in letters (Canadian syllabics) and is
  swapped back after, so its box is sized for two columns. A source that already holds
  those letters alongside wide characters keeps its fence.
- **ER is not drawn.** Skipping it was smaller than fixing the renderer's ER layout.
- **Dropped:** the npm build (`package.json`, esbuild script), the tmux end-to-end
  harness, and the bun test runner; the unit tests run under `claude plugin test`.

## Vendored renderer

`hooks/vendor/mermaid-ascii.js` is upstream's file, unchanged: the ASCII path of
[beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid) 1.1.3 (tag `v1.1.3`,
commit `65f4e0ab`) bundled by upstream's `scripts/build-vendor.mjs`, with the A* search
capped at 40,000 expansions. sha256
`ee4f9dbf4af6e2b8548d0e3fe33a0d38f19f2dcec0457d8e27c3a948f700150a`.

## Tests

From the repo root:

```bash
claude plugin test mermaid-inline
```

`tests/render.test.ts` mounts `AssistantMessage` through the engine on the terminal and
desktop surfaces and checks what the engine would draw; `tests/diagrams.test.ts` covers
the pure functions.

## License

MIT. `LICENSE` is claude-mermaid's (Copyright (c) 2026 Gal Elmalah);
`hooks/vendor/LICENSE` is beautiful-mermaid's (Copyright (c) 2026 Craft Docs).
