---
status: done        # accepted | done | superseded
delivered: 693e3aa  # commit or tag ref — filled when acceptance passes
depends: []         # milestone slugs that must land first
---

# Per-provider quota in the session, as one Claude Mod

The source card is the Obsidian task `pm/cc-plugins/tasks/mod-omp-quota.md` (vault `obsidian`): show the remaining quota of every provider `omp usage --json` reports inside a Claude Code session. That card's premise — "classic hooks cannot do a persistent status line" — is only half true: the settings `statusLine` is not a hook and supports `refreshInterval` in Claude Code 2.1.276 (settings schema text in the binary: "Re-run the status line command every N seconds in addition to event-driven updates"). What only a Mod can do is a pane, a slash command that runs without a model turn, and an in-session toast. This milestone settles that those three are worth the early-access dependency.

## What is committed

The per-provider quota display is one Claude Mod (a function-hook module inside a Claude Code plugin). It owns the always-on status line, the on-demand `/quota` pane with its `/quota refresh`, the periodic poll, and the in-session alert when a provider's status worsens. It does not use the settings `statusLine`, and it does not gate dispatch (dispatch gating is out of scope by the user's ruling of 2026-09-17).

## Concrete enough to build on

- **One mechanism.** A single module fetches `omp usage --json`, keeps the last good result, and feeds all four outputs from it. No second fetcher exists on the settings `statusLine`.
- **The child process names its own omp home.** `~/.claude/settings.json` sets `PI_CODING_AGENT_DIR=/Users/nickhuang/.pi/dispatch` in `env`, every child inherits it, and under it `omp usage --json` returns empty `reports`. Verified 2026-09-18: empty with the inherited value, full with `PI_CODING_AGENT_DIR=~/.omp/agent`.
- **The pane opens only from the command.** A pane opened in answer to a command is placed at any terminal width; a pane the mod opens on its own waits undrawn below 144 columns (the doc comments on `$.ui.open` and the pane's open arguments in the Claude Code type definitions; the file is not on disk — `/plugin-types` writes the running version's copy to `.claude/types`, and the public 2.1.273 copy is `mods/types/claude-code.d.ts` in github.com/anthropics/claude-code).
- **The alert is the in-session toast, not an OS notification.** The Mods API has no OS/desktop notification call; the nearest is `$.ui.toast`, a bar under the prompt shown for about 4 s by default (see its doc comment in the file `/plugin-types` writes).
- **The card's fixture criterion is restated.** `claude plugin test` (hidden; visible only with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`) runs `*.test.ts` files on the `claude-code/testing` kit, with no filesystem, network, or process access and no JSON-fixture mode. The redacted omp snapshot becomes a TypeScript fixture, and the omp call is stubbed inside the test.
- **The data has shapes the display must survive** (live `omp usage --json`, 2026-09-18):
  - six providers are reported, not five — `ollama-cloud` has zero limits;
  - `status` can be `null` (cursor `cursor:requests:gpt-4`);
  - a limit can carry `usedFraction` without `remainingFraction` (cursor "Cursor Models");
  - `window.label` repeats inside one provider — google-antigravity has six limits under two labels, told apart only by the limit's `label` ("Gemini", "Claude & GPT (shared)") or `id`;
  - `window.resetsAt` is epoch milliseconds.
- **Enabling it is a global switch.** `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is set nowhere today; setting it enables function-hook modules for every installed plugin, not only this one.
- **Pin the API version.** The type definitions grew from 9944 to 11160 lines between 2.1.273 and 2.1.276 and state they may change without notice. The build records which Claude Code version it was checked against (2.1.276 here); the card's line references are 2.1.273's.

Defaults taken on two-way doors:

- Providers shown: everything omp reports, not a fixed list, so a provider with no computable fraction shows `—` (today `ollama-cloud`).
- anthropic is shown with the others even though the user's statusline already shows its 5h/7d; omp also carries a 7-day Fable window the statusline lacks.
- A limit's remaining share is `remainingFraction`, else `1 − usedFraction`, else none; a provider's summary is the minimum over limits that have one. Chosen over omp's `capacity` field because whether `capacity` takes the minimum across a provider's limits is unverified — every antigravity pool read 1.0 on 2026-09-18, so the data cannot tell.
- A `null` status is "no signal", never a transition into or out of warning/exhausted.

## Acceptance criteria (restated from the card)

- The omp call, with `PI_CODING_AGENT_DIR` overridden to `~/.omp/agent` and a 10 s timeout, returns non-empty `reports`.
- Fetch once at session start, then every 5 minutes.
- The status line shows each provider's lowest remaining share; `—` where none is computable.
- `/quota` opens a pane listing every limit of every provider — distinguishable where window labels repeat — with remaining share, status, and time to reset; `/quota refresh` runs `omp usage invalidate` and refetches.
- A provider whose status moves from `ok` to `warning` or `exhausted` raises one toast; an unchanged status raises none.
- On omp failure or timeout the last good data stays and the status line marks it stale; no tool call is ever blocked.
- `claude plugin test` is green on TypeScript tests that use the redacted snapshot as a fixture, including the `null`-status, `usedFraction`-only, zero-limit, and repeated-label cases.
- One real session with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` shows the status line, the pane, and a toast correctly.

## Left open

- **Where the module lives** — a new marketplace plugin, or the one module slot of an existing plugin such as pi-dispatch. A plugin's `hooks/hooks.json` may name only one module, so taking an existing plugin's slot forecloses any later mod there.
- **The pane's layout** — how antigravity's labelled pools and the reset countdowns are arranged.
- **Whether the toast alone is enough**, or an `osascript` call through `$.process.run` adds an OS notification. The osascript route is untested.
- **How staleness shows on the one line**, and the exact poll cadence beyond the card's 5 minutes.

## What would overturn this

- The Mods API removes or breaks `ui.status`, the command-opened pane, or `clock.every` in a release before this ships — then the persistent line falls back to the settings `statusLine` with `refreshInterval`.
- Turning on `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` globally makes another installed plugin's module misbehave — the switch is not scoped to this plugin.
- In use, the pane, `/quota refresh`, and the toast go unused and only the one-line summary is read — then the Mod bought nothing a statusline script would not.

Directions that lost:

- **Extend `~/.claude/scripts/statusline.sh` with `refreshInterval`** — stable surface, but no pane, no model-free refresh, no in-session alert: three of the card's eight acceptance criteria dropped.
- **Split: line on `statusLine`, pane and toast in a Mod** — survives an API break, but two mechanisms fetch the same JSON on two cadences.

## Suggested skills

- `marketplace` — the module ships inside a plugin in this repo; the four-file invariant and version bump apply whichever plugin hosts it.
- `plugin-dev:plugin-structure` — `hooks/hooks.json` gains a `modules` entry alongside or instead of classic `hooks`.
