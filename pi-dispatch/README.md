# pi-dispatch

Offload heavy work to cheap/fast models via [omp (oh-my-pi)](https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent), so Claude spends tokens only on briefs and review — never on the worker's reading, reasoning, or generation.

## Architecture

```
Claude (main)          pi-dispatcher agent (haiku)      omp worker (cheap model)
  write brief   ──►    pi-dispatch.sh (instant)   ──►   background run in RUNDIR
  ...                  pi-poll.sh loop (1 line/round)     result.md + stream + rc
  review result ◄──    tight summary + file path   ◄──   distilled final text
```

- **`scripts/pi-dispatch.sh [--profile NAME] BRIEF [OUTDIR [PRIOR_RUNDIR]]`** — launches omp in the background (setsid process group), returns `OUTPUT=/PID=/RUNDIR=` instantly. `PRIOR_RUNDIR` resumes the prior run's session (`--resume`), preserving worker context across rounds without re-briefing.
- **`scripts/pi-poll.sh RUNDIR`** — stateless, idempotent one-line status: `RUNNING` or a terminal `STATUS=OK|FAIL …`. On OK it distills the final assistant text into `result.md` (raw stream kept as `pi.stream.jsonl`). Terminal verdicts persist in `RUNDIR/status` and replay on re-poll. Liveness guards (wall-clock, stall) group-kill orphans automatically.
- **`scripts/pi-stop.sh RUNDIR`** — idempotent group-kill cancel.
- **`scripts/pi-probe.sh [--bin-only] [PROBE_DIR]`** — pre-flight gate: `--bin-only` checks the agent binary is on PATH (exit 0/1); the full probe runs `say ok` on the exact routing a dispatch would resolve. Callers never touch the agent binary themselves.
- **`scripts/pi-watch.sh RUNDIR`** — one-shot monitoring snapshot of a live run (fixed 4 lines regardless of stream size): event/byte counts, tool progress + current tool, token usage, latest assistant text. `pi-poll.sh` answers "is it done?"; `pi-watch.sh` answers "what is it doing?". Safe on a mid-write stream (partial trailing line skipped).
- **`scripts/pi-worktree.sh create|clean …`** — git-worktree isolation for code-writing tasks; cleanup captures the diff before removal.
- **`scripts/pi-acp-*.sh`** — interactive ACP worker sessions (`omp acp` over a stdin fifo / stdout jsonl pair), for work that needs mid-flight governance rather than fire-and-forget:
  - `pi-acp-start.sh [--resume SID] [OUTDIR [CWD]]` — background session + handshake, returns `RUNDIR=/SESSION=/PID=`. `--resume` restores a prior session's context (`session/load`) across processes.
  - `pi-acp-send.sh RUNDIR prompt TEXT_OR_FILE | permission OPTION_ID [REQ_ID] | cancel` — non-blocking frame sends: start a turn, answer a tool-permission request, or cancel the in-flight turn (session survives).
  - `pi-acp-poll.sh RUNDIR` — one line per call: `IDLE` / `RUNNING` / `PERMISSION id=… tool=… options=…` (worker blocked awaiting an answer — this is the governance hook) / `STATUS=DONE id=… stopReason=…` (per-turn terminal; turn text distilled to `result.md`) / `STATUS=DEAD`. Teardown reuses `pi-stop.sh` (same pid/pgid layout).

  Division of labor: `pi-dispatch.sh` (`-p` mode, auto-approved tools) stays the batch fan-out workhorse; ACP sessions are for interactive workers — per-tool-call approval, warm multi-turn without re-briefing, protocol-level cancel.
- **`agents/pi-dispatcher.md`** — a haiku subagent that runs the launch→poll→distill loop so even the polling stays out of the main context.

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
3. Launch each brief with `pi-dispatch.sh` (each returns instantly) — directly or via one `pi-dispatcher` agent per task.
4. Poll each RUNDIR until terminal; failures carry diagnostics in `RUNDIR/pi.stderr.log`.
5. `pi-worktree.sh clean` captures each task's diff; Claude reviews diffs/results against the brief's contract and merges or re-dispatches (resume via `PRIOR_RUNDIR` keeps the worker's session context).

Context hygiene: main never reads worker streams or source material — only briefs out, distilled summaries and diffs back. Each worker sees only its own brief and worktree.

## Prerequisites

- `omp` installed and authenticated (`omp` → `/login`), `jq`, `git` (for worktrees).

## Tests

`bash tests/profile-test.sh && bash tests/wrapper-test.sh && bash tests/poll-test.sh && bash tests/worktree-cleanup-test.sh && bash tests/probe-watch-test.sh && bash tests/acp-test.sh` — all pure-local, no network (acp-test uses a bash shim in place of `omp acp`).
