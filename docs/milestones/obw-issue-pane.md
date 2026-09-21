---
status: superseded  # accepted | done | superseded
delivered:          # commit or tag ref — filled when acceptance passes
depends: []         # milestone slugs that must land first
---

# `/issue`: an obw task card in a pane, read through the Obsidian CLI

**Superseded on 2026-09-21 by `obw-issue-pane-dashboard-views.md`, after the pane it describes
shipped.** The pane was delivered as written; what this milestone no longer records truthfully is
where its list comes from. Four of its commitments were replaced when the list moved to the
project's Bases dashboard: the hand-written search query below, one CLI call per view, kebab
names as list labels, and the acceptance criterion that `/issue` lists "unfinished cards". Its
reason for rejecting `base:query` — that a base row's keys are localized display names — is
answered by `docs/spec/base-rows-keyed-by-path-not-labels.md`, which forbids reading a row by any
column label. Everything else here, in particular the CLI's output shapes, the element bounds and
the config lookup, is still accurate and is why this file is kept rather than deleted.

The source card is the Obsidian task `pm/cc-plugins/tasks/mod-obw-issue-pane.md` (vault `obsidian`): show an obsidian-workspace task card in a Claude Mod pane instead of reading it into the conversation, so the card costs no conversation tokens. Four of that card's premises are false against the installed Claude Code 2.1.276 and Obsidian CLI 1.13.7, and this milestone restates them:

- The UI has a `Markdown` element since Claude Code 2.1.274; the card's "no markdown component" was true only of 2.1.273.
- `.obsidian.yaml` holds a vault name (`vault: obsidian`), not a path.
- Reading the vault with `$.fs` conflicts with obw's rule that nothing bypasses the CLI against the vault (`obsidian-workspace/skills/pm/SKILL.md:138`); the user ruled for the CLI.
- The card's 4 MiB limit was a `$.fs` limit. What binds is the 10000-character element bound.

The card's d.ts line references are 2.1.273's. Everything below was checked against 2.1.276; the type definitions are not on disk (`/plugin-types` writes the running version's copy).

## What is committed

`/issue` is a Claude Mod in obsidian-workspace's (plugin `obw`) module slot, which is free because obw has no hooks today. Every read of vault content goes through the `obsidian` CLI via `$.process.run`; `$.fs` reads only the project's own `.obsidian.yaml`, which is not in the vault, and viz's `installed_plugins.json` under `$CLAUDE_CONFIG_DIR` or `$HOME/.claude`, and writes only the card body to `/tmp/viz/obw/<slug>.md` for render.sh. The card is drawn in a pane opened by the command and never enters the conversation.

`/issue` trusts nothing the CLI prints until it matches a known success shape, and draws nothing until it fits the element's bounds. Every other outcome — a closed app, an unknown vault, a missing card, an empty project, an oversized or malformed body — becomes a message in the pane, and the hook never throws. The mod makes one CLI call per view and scopes every query to the project's own folder. It starts two other processes. `uvx termaid@0.9.0 --width 80` runs once per supported Mermaid block of a shown card, one block at a time, after the card is drawn and without holding the command; uv is an optional runtime dependency, and a block termaid does not draw stays a code block. The viz plugin's `render.sh` runs only when the user presses the card's Open in browser Button.

## Concrete enough to build on

- **Host.** obw ships `hooks/hooks.json` naming one module, as `omp-quota/hooks/hooks.json` does. A plugin names one module, so any later obw mod registers its commands in this same module. obw's skills keep working when `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` is unset. obw's `plugin.json` description currently says "Skills-only" and stops being true.
- **Config lookup.** Walk up from `$.session.cwd()` calling `$.fs.exists` on `<dir>/.obsidian.yaml`; `$.fs.ancestors` looks only for relative `.md` names and does not apply. A module imports only the plugin's own files, so `vault`, `pm.project` and the card frontmatter are parsed by the plugin's own code. Under the CLI route the vault name is all the mod needs; no vault path is resolved.
- **Invoking the CLI.** argv[0] is the bare name `obsidian`. `$.process.run` gives the child the Claude process's own environment (function `nKo` in the 2.1.276 binary's strings), whose PATH holds `/opt/homebrew/bin`; omp-quota calls bare `omp` the same way (`omp-quota/hooks/register.ts:8,24`). A missing executable makes `process.run` reject.
- **Obsidian.app closed.** The CLI (`/Applications/Obsidian.app/Contents/MacOS/obsidian-cli`) is a thin client of `$HOME/.obsidian-cli.sock` and cannot start the app. Verified 2026-09-18: `HOME=/nonexistent obsidian vault=obsidian version` printed "The CLI is unable to find Obsidian. Please make sure Obsidian is running and try again." on stderr with exit 1, instantly. The timeout only guards a hung app.
- **Output shapes** (CLI 1.13.7, 2026-09-18; exit 0 unless noted):
  - a card: text starting with `---\n`;
  - a list: a JSON array of strings, or exactly `No matches found.` — an empty list, even under `format=json`;
  - errors: `Error: File "<path>" not found.`, `Vault not found.` (no `Error:` prefix), `Error: Command "<x>" not found. …`;
  - app absent: the stderr message above, exit 1.
  Classification is positive: anything that is not a success shape is an error, shown verbatim.
- **Inputs that silently change meaning** (verified 2026-09-18). `read path=` with an empty value returns the note currently active in Obsidian. `file=` resolves a name across the whole vault and picked the wrong one of two same-named notes. The mod builds `path=pm/<project>/tasks/<kebab>.md` only after rejecting a `<kebab>` that is empty or contains `/`, and never uses `file=`.
- **The list query** is `search query='[type:task] [project:<project>] -[status:done]' path=pm/<project> format=json`. Property search matches substrings (`[project:cc-plug]` returned the cc-plugins cards) and an unbalanced `[type:task` silently widens to every task note in the vault; the `path=` scope made both exact (verified 2026-09-18). "Unfinished" is `status != done`, `blocked` included, as in the pm skill's frontier query.
- **Drawing bounds.** `Markdown` and `Text` take at most 10000 characters, with tab and newline the only control characters, and a tree that does not validate "draws the engine's own" (2.1.276 type definitions: `MarkdownProps`; the `CodeProps` doc comment, which bounds a `Text` string "the same way"; and the `ui.render` doc comment). The mod strips other control characters and enforces the length itself. The largest current card is 5365 characters (9114 bytes, mostly CJK). `$.process.run` cuts each stream silently at 4 MiB (`lot=4194304` in the binary's strings), so the element bound always binds first.
- **`Select`** needs at least one option, and its options carry only `value` and `label` (2.1.276 type definitions, `SelectOption`). An empty project draws a `Text`. `Select` does not exist on the mobile surface.
- **`/issue` is free**: no installed plugin, command or skill registers it (search of `~/.claude/plugins`, `~/.claude/commands`, `~/.claude/skills` and this repo, 2026-09-18). A later registration of the same name would replace it.
- **Build against 2.1.276**, and record the version checked, as omp-quota did.

Defaults taken on two-way doors, none visible outside the mod:

- **Display:** a pane opened by the command, placed at any terminal width. Known cost: in fullscreen it docks beside the transcript at about half the screen, which is why omp-quota moved to the AbovePrompt band in b87e81e; the band was not taken because it is one shared instance omp-quota already draws in.
- **One pane:** the `Select` on top, the chosen card below; `/issue <kebab>` preselects that card.
- **Header:** title, status and priority as `Text`, parsed from `read`'s frontmatter; status and priority are coloured labels, followed by an `AC <checked>/<total>` count of the Acceptance Criteria checkboxes when there are any. The body with frontmatter stripped is one `Markdown` block until termaid draws a Mermaid block; then the body splits into `Markdown` around a `Code` element holding that diagram. `[[wikilinks]]` draw as plain text.
- **Styling:** a blank row and a dim rule set the card off from the list; errors are red, progress and empty-list notices dim.
- **List labels:** the kebab names from the search paths — one call, no per-card lookups.
- **Obsidian closed:** show the CLI's message and stop; launch nothing.
- **Over 10000 characters:** clip with a visible notice.

## Acceptance criteria

- `/issue` finds `.obsidian.yaml` from the session's cwd upward and reads `vault` and `pm.project`; when none is found, or a key is missing, the pane says which.
- `/issue` with no argument lists the project's unfinished cards in a `Select`, scoped to `pm/<project>`; with no unfinished cards it says so in text.
- Picking a card, or `/issue <kebab>`, draws that card's title, status and priority, and its body as markdown with the Acceptance Criteria checkboxes, in the same pane below the list.
- All vault content comes from the `obsidian` CLI; none of it enters the conversation.
- Obsidian closed, an unknown vault, a missing card, an empty or `/`-containing argument, output of no known shape, and a body over 10000 characters each draw a message in the pane; the hook never throws and the pane never falls back to the engine's default drawing.
- `claude plugin test` is green on tests that cover every output shape above with the CLI call stubbed (the test kit has no process access).
- Whether `$.fs` expands `~` is tested live and recorded. Nothing depends on the answer: every `$.fs` path the mod uses is absolute, built from `$.session.cwd()`, from an absolute `$CLAUDE_CONFIG_DIR` or `$HOME`, or under the fixed `/tmp/viz/obw/`.
- One real session with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` shows the list, a card, and the closed-app message correctly.
- A shown card has an Open in browser Button in the terminal when viz is installed, and none when viz is absent or on another surface. A press writes the card body to `/tmp/viz/obw/`, runs viz's `render.sh` on it with a 15 s timeout, and the pane shows where the card was rendered or why it was not.
- In one real session with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, pressing Open in browser on a card with a Mermaid block opens the rendered page in the browser.
- A shown card's Mermaid blocks are drawn in the pane as text diagrams by `uvx termaid@0.9.0` with a 5 s timeout, after the card itself is drawn. A block with an unsupported diagram type, a leading `%%` comment or `---` frontmatter never runs; blank output, a failure, a missing uv or the timeout keep the code block. Diagram text is bounded like the body.

## Left open

- **A stale socket after an Obsidian crash.** It should fail like a closed app; untested live.
- **The exact text and layout of each error message** — settled while building.
- **Mobile** — whether a column of `Button`s replaces the `Select` there. Outside the card's scope.
- **The pm skill's own list query** (`obsidian-workspace/skills/pm/SKILL.md:62,105`) is unscoped and matches substrings too. Latent — no project name is a substring of another — and outside this card; flagged, not fixed.
- **Sandboxing of the press.** Whether the Bash sandbox or a permission prompt applies to a mod's `$.fs.write` to `/tmp/viz/obw/` and its `$.process.run` of `bash`, and whether `onPress` side effects run live as in the test kit, is untested live.
- **SSH holding the run.** Under SSH, `render.sh` starts a background server that inherits stdin, which may hold the run until the 15 s timeout; the pane then shows the timeout message. Untested live.
- **Diagrams and colour live.** How a `Code` element with no language and `truncate-end` looks in the terminal and in herdr; whether herdr shows 24-bit hex colours; whether a permission or sandbox prompt applies to a mod's `uvx` run; whether the 5 s timeout is enforced (the test kit does not enforce `timeoutMs`); and the first run on a machine with no uv-managed Python. Untested live.

## What would overturn this

- Obsidian being closed is the common case when `/issue` runs — then `open -a Obsidian` and one retry earns its side effect; if that is still not enough, reading the single card by file buys back app independence, at the cost of an exception to the CLI-only rule.
- The Mods API drops `$.process.run` or the command-opened pane.
- A second obw mod needs release or failure isolation from `/issue` — then the one-slot host costs what a dedicated plugin would have avoided.
- The CLI starts returning an error in a shape that matches a success shape (for example a body beginning with `---`), so positive classification lets it through.
- A card grows past 10000 characters often enough that clipping hides what people need — then splitting the body at `## ` headings earns its code.
- The engine starts reporting invalid trees to the user — then the mod's own bound checks are redundant.

Directions that lost: a dedicated plugin, and a shared plugin for all `claude-mods` cards (host); direct `$.fs` reads, and CLI for the list with `$.fs` for one card (read path); a view-switching pane, and one pane per card as tabs (layout); per-card `properties` calls, and `base:query` on the dashboard, whose row keys are localized display names (list labels).

## Specs proposed from this milestone

- `docs/spec/obsidian-cli-output-classified-positively.md`
- `docs/spec/obsidian-cli-never-empty-target.md`
- `docs/spec/mod-ui-text-within-element-bounds.md`

## Suggested skills

- `plugin-authoring` — the module is a function-hook plugin (`register(on, options)`, `command.run`, panes); it says where the exact types come from and how to run a plugin under development.
- `marketplace` — obw gains a `hooks/hooks.json` module; the version bump, `plugin.json` description ("Skills-only") and README must follow.
- `spec:spec` — `slice obsidian-workspace/hooks/…` before building, and accept or reject the three proposed entries above.
