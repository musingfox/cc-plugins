---
name: wizard
description: >-
  Generate an interactive bash wizard that walks a human through the manual
  stages only they can perform. Use when a stage needs a human (a dashboard
  login, a key only visible in a web UI, an irreversible cutover the user must
  approve) and the user wants a re-runnable script rather than chat
  instructions. Covers provisioning infrastructure, setting up credentials or
  CI secrets, and walking an unfamiliar third-party dashboard or running a
  one-off migration or cutover from one state to another.
---

# Wizard

A **wizard** is a bash script that walks a human, stage by stage, through a manual procedure that's tedious to do by hand and tedious to re-explain to an AI every time. It opens each URL, says exactly what to click and copy, captures the values, writes them where they belong (`.env`, GitHub secrets), confirms at every stage, and shows how many stages are left. It might configure third-party services, run a one-off migration, or move the project from one state to another.

The delightful UX is already solved by ${CLAUDE_PLUGIN_ROOT}/skills/wizard/template.sh: stage-by-stage progress, confirmation gates, cross-platform URL opening (including WSL), hidden secret entry, idempotent `.env` upserts, `gh secret`/`gh variable` writes, and a closing summary. **Your job is only to scope the procedure and author its stages.** The library above the `STAGES` marker is identical in every wizard; that consistency is the point: never hand-edit it.

A wizard is ephemeral by default: built for one run, saved to a scratch or `scripts/` path, deleted when the job's done. Commit it only when the user wants a repeatable setup path that should live in the repo.

## Process

### 1. Scope the procedure

Work out every manual stage the human must take and every value that gets captured along the way. Read the repo first, don't ask cold:

- For setup: `.env`, `.env.example`, `.env.*`, `README`, `docker-compose*`, framework config, and `.github/workflows/*` (every `secrets.*` / `vars.*` reference is a value the wizard must produce).
- For a migration or transition: the current state, the target state, and the irreversible actions between them.

Then show the user the ordered list of stages and the values each produces, and confirm: they may add, drop, or reorder.

**Done when:** every stage is named in order, and for each captured value you know (a) where the human gets it, (b) where it's written (`.env`, a GitHub secret, both, or nowhere; some stages are pure actions), and (c) whether it's secret (hidden entry) or public.

### 2. Map each stage's journey

For each stage, write the precise path a human follows: which URL to open, what to do there, where a value is shown, which variable it fills: e.g. "Dashboard → Developers → API keys → Reveal test key → copy". Where you don't actually know the current UI or the exact command, say so and ask the user or check the docs: never invent stages that may not exist.

**Done when:** every stage traces to concrete instructions a stranger could follow.

### 3. Author the wizard

Copy `${CLAUDE_PLUGIN_ROOT}/skills/wizard/template.sh` to the target path. Replace the example stage with one `stage` call per stage, in dependency order. Use the library helpers: `stage`, `say`/`step` (a bullet line inside a stage), `open_url`, `ask`/`ask_secret`, `write_env`, `set_secret`/`set_var`, `pause`/`confirm`. Set `TOTAL_STAGES` to the number of `stage "` calls you wrote.

Hold the bar the template sets: open the URL before asking for its value, use `ask_secret` for anything secret, `write_env` every persisted value, `set_secret` only the values CI actually needs, and `confirm` before any irreversible action — always as `if confirm "…"; then … fi`, never as a bare statement: `confirm` returns non-zero on "no", which under `set -e` aborts the wizard with exit 1 and skips the closing summary. `confirm "…" || exit 0` aborts too (exit 0, summary still skipped); use `if` when the summary should still print. Each `stage` clears the screen so only the current stage is visible: keep a stage to one focused task so nothing the human needs scrolls away. Don't touch the library above the marker.

### 4. Verify and hand off

- `bash -n <script>`; run `shellcheck` if available.
- `TOTAL_STAGES` equals the count: `grep -c '^stage "' <script>` (the template's own `stage()` definition does not match).
- `chmod +x <script>`.
- Don't run it end-to-end yourself: it opens browsers and blocks on human input. Trace it statically instead: every value from scoping is captured and lands where scoping said, and every `set_secret` name exactly matches a `secrets.*` reference in CI.
- Run `git check-ignore -q "$ENV_FILE"`; on failure, add `$ENV_FILE` to `.gitignore` before handing off. The wizard writes live credentials into it, and a repo that ignores only `.env.local` will happily commit the `.env` the wizard just created.
- Tell the user how to run it. If it's a repeatable setup path, commit it and link it from the README so the next person runs the script instead of asking an AI.
