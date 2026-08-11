# pi-dispatch

Offload heavy work to cheap/fast models via [omp (oh-my-pi)](https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent), so Claude spends tokens only on briefs and review — never on the worker's reading, reasoning, or generation.

## Architecture

```
Claude (main)          wrapper (haiku, optional)        omp worker (cheap model)
  write brief   ──►    pi-dispatch.sh (instant)   ──►   background run in RUNDIR
  ...                  pi-poll.sh loop (1 line/round)     result.md + stream + rc
  review result ◄──    tight summary + file path   ◄──   distilled final text
```

- **`scripts/pi-dispatch.sh [--profile NAME] BRIEF [OUTDIR [PRIOR_RUNDIR]]`** — launches omp in the background (setsid process group), returns `OUTPUT=/PID=/RUNDIR=` instantly. `PRIOR_RUNDIR` resumes the prior run's session (`--resume`), preserving worker context across rounds without re-briefing.
- **`scripts/pi-poll.sh RUNDIR`** — stateless, idempotent one-line status: `RUNNING` or a terminal `STATUS=OK|FAIL …`. On OK it distills the final assistant text into `result.md` (raw stream kept as `pi.stream.jsonl`). Terminal verdicts persist in `RUNDIR/status` and replay on re-poll. Liveness guards (wall-clock, stall) group-kill orphans automatically.
- **`scripts/pi-stop.sh RUNDIR`** — idempotent group-kill cancel.
- **`scripts/pi-run.sh [--profile P] [--deadline S] BRIEF [OUTDIR [PRIOR_RUNDIR]]`** — run-to-terminal: dispatch + block until terminal in ONE call, one `OUTCOME=OK|FAIL …` line. A detached setsid watchdog reaps the worker at the deadline even if the CALLER dies mid-wait (harness timeout, killed sub-agent) — orphan safety no longer depends on the caller passing the right timeout. Use from contexts that must block in a single Bash call (sub-agents can't be woken by Monitor).
- **`scripts/pi-probe.sh [--bin-only] [PROBE_DIR]`** — pre-flight gate: `--bin-only` checks the agent binary is on PATH (exit 0/1); the full probe runs `say ok` on the exact routing a dispatch would resolve. Callers never touch the agent binary themselves.
- **`scripts/pi-watch.sh RUNDIR`** — one-shot monitoring snapshot of a live run (fixed 4 lines regardless of stream size): event/byte counts, tool progress + current tool, token usage, latest assistant text. `pi-poll.sh` answers "is it done?"; `pi-watch.sh` answers "what is it doing?". Safe on a mid-write stream (partial trailing line skipped).
- **`scripts/pi-worktree.sh create|clean …`** — git-worktree isolation for code-writing tasks; cleanup captures the diff before removal.
- **`agents/builder.md`** — a brief-driven executor. When the brief embeds the `pi-agent.sh` offload usage, builder operates it as a pure operator: `pi-agent.sh start` per task, `pi-agent.sh watch` as the main loop, runs each worker's acceptance check, and distills a report to main. When the brief carries no offload usage, builder does the work itself. Builder does NOT choose the mode — the brief does.
- **`agents/reviewer.md`** — an independent contract judge. Given ONLY the contract, the deliverable paths, and the check output, it returns an evidence-backed PASS/FAIL per clause. It never sees the builder transcript and never runs offload verbs.

## Named agents — `pi-agent.sh` (native sub-agent verbs)

`scripts/pi-agent.sh` is the unified, name-addressed entry point over the primitives above, mirroring Claude Code's native sub-agent experience. The registry is the filesystem: `$PI_RUNS_DIR/agents/<NAME>` symlinks to the run's RUNDIR.

| native experience | command |
|---|---|
| `Agent(name, prompt)` | `pi-agent.sh start NAME [--profile P] BRIEF` |
| `SendMessage(to)` | `pi-agent.sh send NAME TEXT_OR_FILE` |
| poll / `TaskOutput` | `pi-agent.sh poll NAME` |
| agent-view peek | `pi-agent.sh peek NAME` |
| agent panel | `pi-agent.sh ls` |
| `TaskStop` | `pi-agent.sh stop NAME` |
| background completion / needs-input notifications | `pi-agent.sh watch [INTERVAL]` |

`send` on a finished run resumes its session (new RUNDIR, context preserved — native SendMessage semantics) and re-points the NAME. `watch` polls every registered agent, prints one line per meaningful state change (turn done, dead, stall — volatile counters normalized away), and exits when nothing is in flight; arm it on the Monitor tool so each line arrives as a chat notification.

When/how to choose between direct dispatch, dispatcher, builder/reviewer, Workflow
thin-shells — and when not to outsource at all: see
[docs/dispatch-doctrine.md](docs/dispatch-doctrine.md).

## Running inside herdr (better experience)

[herdr](https://herdr.dev) is a terminal multiplexer that recognizes coding agents in panes. When Claude itself runs in a herdr pane (`HERDR_ENV=1`), herdr's CLI is the nicer control plane over the same omp workers, and `pi-agent.sh` is not needed:

| | `pi-agent.sh` | `herdr agent` |
|---|---|---|
| worker visibility | RUNDIR files | a live pane you can watch and type into |
| death mid-turn | detected on the next poll | the waiting call returns `agent_not_running` (rc=1) at once |
| worktree | `pi-worktree.sh create` (8 named params) | `herdr worktree create --cwd R --branch B` |
| worktree teardown | kill-confirm, then diff capture, then remove | `remove --force` deletes a live worktree, no kill-confirm, no diff |
| run registry | name→RUNDIR symlink, `result.md`, replayable terminal verdict | none — the agent name dies with the pane |

herdr ships its own skill (`herdr --skill`); pi-dispatch references it rather than vendoring a copy. It does not auto-trigger on delegation intent, so load it explicitly before issuing herdr commands.

`pi-agent.sh` remains the portable path: outside a herdr pane (cron, CI, the web and IDE clients) it is the only one that works, and cf/spiral consume `pi-dispatch.sh`/`pi-worktree.sh` directly on either plane.

Either way, put the output contract in the brief — an absolute artifact path plus a one-line format, so the verdict is read from a file instead of parsed out of a transcript. See [skills/pi-dispatch/SKILL.md](skills/pi-dispatch/SKILL.md).

## Model routing

`profiles.conf` maps names to omp models (must have working omp auth):

| profile  | model                  | use                       |
|----------|------------------------|---------------------------|
| fast     | xai-oauth/grok-build   | default; mechanical work  |
| balanced | openai-codex/gpt-5.4   | ordinary implementation   |
| careful  | openai-codex/gpt-5.5   | harder reasoning          |

Precedence: `PI_PROVIDER`/`PI_MODEL` env > `--profile`/`PI_PROFILE` > default (`grok-build`). `PI_BIN` swaps the binary (default `omp`).

## Scaling to N parallel tasks (dispatch → review)

Dispatch is non-blocking, so fan-out is just N launches:

1. Claude decomposes work into self-contained briefs (one observable outcome each).
2. For code-writing tasks, `pi-worktree.sh create` one worktree per task; put the worktree path in the brief (worker uses absolute paths, never cd out).
3. Launch each brief with `pi-dispatch.sh` (each returns instantly) — directly, or hand the whole fan-out to one `builder` agent.
4. Poll each RUNDIR until terminal; failures carry diagnostics in `RUNDIR/pi.stderr.log`.
5. `pi-worktree.sh clean` captures each task's diff; Claude reviews diffs/results against the brief's contract and merges or re-dispatches (resume via `PRIOR_RUNDIR` keeps the worker's session context).

Context hygiene: main never reads worker streams or source material — only briefs out, distilled summaries and diffs back. Each worker sees only its own brief and worktree.

## Prerequisites

- `omp` installed and authenticated (`omp` → `/login`), `jq`, `git` (for worktrees).

## Tests

`bash tests/profile-test.sh && bash tests/wrapper-test.sh && bash tests/poll-test.sh && bash tests/worktree-cleanup-test.sh && bash tests/probe-watch-test.sh && bash tests/agent-test.sh` — all pure-local, no network (agent-test uses a bash shim in place of `omp`).
