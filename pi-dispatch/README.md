# pi-dispatch

Offload heavy work to cheap/fast models via [pi](https://github.com/earendil-works/pi) cheap/fast models, so Claude spends tokens only on briefs and review — never on the worker's reading, reasoning, or generation.

## Architecture

```
Claude (main, or a builder)                           pi worker (cheap model)
  write brief   ──►    pi-agent.sh start (instant)  ──►   background run in RUNDIR
  ...                  pi-agent.sh watch (1 line/change)  result.md + stream + rc
  review result ◄──    terminal line + file path    ◄──   distilled final text
```

- **`scripts/pi-dispatch.sh BRIEF [OUTDIR [PRIOR_RUNDIR]]`** — launches pi in the background (setsid process group), returns `OUTPUT=/PID=/RUNDIR=` instantly. `PRIOR_RUNDIR` resumes the prior run's session (`--session <id>`), preserving worker context across rounds without re-briefing.
- **`scripts/pi-poll.sh RUNDIR`** — stateless, idempotent one-line status: `RUNNING` or a terminal `STATUS=OK|FAIL …`. On OK it distills the final assistant text into `result.md` (raw stream kept as `pi.stream.jsonl`). Terminal verdicts persist in `RUNDIR/status` and replay on re-poll. Liveness guards (wall-clock, stall) group-kill orphans automatically. Terminal lines carry `model=<provider/model> cost=$<sum over all turns> turns=<n>`; a provider spend wall is killed on sight and tagged `QUOTA` (balance exhausted) or `QUOTA-WINDOW` (a rolling usage window that resets on its own); transient rate limits are neither, and `pi-agent.sh watch` then aborts the siblings it was given so the caller can fall back to a Claude builder.
- **`scripts/pi-stop.sh RUNDIR`** — idempotent group-kill cancel.
- **`scripts/pi-run.sh [--deadline S] BRIEF [OUTDIR [PRIOR_RUNDIR]]`** — run-to-terminal: dispatch + block until terminal in ONE call, one `OUTCOME=OK|FAIL …` line. A detached setsid watchdog reaps the worker at the deadline even if the CALLER dies mid-wait (harness timeout, killed sub-agent) — orphan safety no longer depends on the caller passing the right timeout. Use from contexts that must block in a single Bash call (sub-agents can't be woken by Monitor).
- **`scripts/pi-probe.sh [--bin-only] [PROBE_DIR]`** — pre-flight gate: `--bin-only` checks the command's binary is on PATH (exit 0/1); the full probe runs `say ok` on the same `PI_DISPATCH_CMD` a dispatch would run, bounded by `PI_PROBE_DEADLINE_S` (default 60) and reporting `STALLED` rather than hanging its caller. Callers never touch the agent binary themselves.
- **`scripts/pi-watch.sh RUNDIR`** — one-shot monitoring snapshot of a live run (fixed 4 lines regardless of stream size): event/byte counts, tool progress + current tool, token usage, latest assistant text. `pi-poll.sh` answers "is it done?"; `pi-watch.sh` answers "what is it doing?". Safe on a mid-write stream (partial trailing line skipped).
- **`scripts/pi-worktree.sh create|clean …`** — git-worktree isolation for code-writing tasks; cleanup captures the diff before removal.
- **`agents/builder.md`** — a brief-driven executor. When the brief embeds the `pi-agent.sh` offload usage, builder operates it as a pure operator: `pi-agent.sh start` per task, `pi-agent.sh watch` as the main loop, runs each worker's acceptance check, and distills a report to main. When the brief carries no offload usage, builder does the work itself. Builder does NOT choose the mode — the brief does.
- **`agents/reviewer.md`** — an independent contract judge. Given ONLY the contract, the deliverable paths, and the check output, it returns an evidence-backed PASS/FAIL per clause. It never sees the builder transcript and never runs offload verbs.

## Named agents — `pi-agent.sh`

`scripts/pi-agent.sh` is the unified, name-addressed entry point over the primitives above, mirroring Claude Code's native sub-agent experience. The registry is the filesystem: `$PI_RUNS_DIR/agents/<NAME>` symlinks to the run's RUNDIR.

| native experience | command |
|---|---|
| `Agent(name, prompt)` | `pi-agent.sh start NAME BRIEF` |
| `SendMessage(to)` | `pi-agent.sh send NAME TEXT_OR_FILE` |
| poll / `TaskOutput` | `pi-agent.sh poll NAME` |
| agent-view peek | `pi-agent.sh peek NAME` |
| agent panel | `pi-agent.sh ls` |
| `TaskStop` | `pi-agent.sh stop NAME` |
| background completion / needs-input notifications | `pi-agent.sh watch INTERVAL NAME…` |

`send` on a finished run resumes its session (new RUNDIR, context preserved — native SendMessage semantics) and re-points the NAME. `watch` polls the agents named on its command line — the registry is machine-wide, so it takes its scope explicitly rather than sweeping other dispatches' workers — prints one line per meaningful state change (turn done, dead, stall — volatile counters normalized away), and exits when none of them is in flight.

From main, run `pi-agent.sh watch` as a background task (`Bash(run_in_background: true)`) and follow it with Monitor; a sub-agent cannot be woken that way, so it runs `watch` in the foreground.

When/how to choose between direct dispatch, dispatcher, builder/reviewer, Workflow
thin-shells — and when not to outsource at all: see
[docs/dispatch-doctrine.md](docs/dispatch-doctrine.md).

Put the output contract in the brief — an absolute artifact path plus a one-line format, so the verdict is read from a file instead of parsed out of a transcript. See [skills/pi-dispatch/SKILL.md](skills/pi-dispatch/SKILL.md).

## Model routing

Routing is one variable, `PI_DISPATCH_CMD`: the agent command the dispatch runs, ahead of its own flags. Bash expands it the way it expands a shell line, so it can carry env assignments, the binary and its routing flags:

```bash
PI_DISPATCH_CMD='pi --model openai-codex/gpt-5.6-terra' pi-dispatch.sh BRIEF
PI_DISPATCH_CMD='env PI_CODING_AGENT_DIR=$HOME/.omp/agent omp --model cursor/grok-4.7-medium' pi-dispatch.sh BRIEF
```

Unset, it is `pi`, and pi's own `settings.json` (`defaultProvider`/`defaultModel` in `$PI_CODING_AGENT_DIR`, else `~/.pi/agent`) chooses the model; so does any command without `--model`. The agent must speak pi's CLI (`-p`, `--mode json`, `-e`, `--session-dir`, `--session`, `@file`) and its json event stream: pi and omp do, `claude -p` does not. The binary must be on PATH or given by absolute path, because the command runs after the cd into `PI_CWD`; a relative one is refused with exit 2. So is a command that sets `PI_CWD`, `PI_WRITABLE_FILES`, `PI_REAL_GIT` or `PATH`, or passes `env` an option such as `-i` or `-u`: those carry or could clear the fence. Words are not globbed, so `[high]` or `gpt-5.*` reach the agent as written. A command containing a newline, `#`, `;`, `&`, `|`, `<`, `>`, parentheses, backquotes or a trailing backslash is refused with exit 2, because the dispatch appends its own flags and any of those would cut them off or garble them, fence extension included. So is `--provider` without `--model`: pi resolves the model first and the provider follows it, so a provider alone lands on pi's default while looking pinned (measured 2026-09-15). Variables in the command expand each time a run starts, resumes included, so keep them to stable ones such as `$HOME`. `pi-probe.sh` asks `pi-dispatch.sh` itself (`PI_DISPATCH_CHECK=1` validates the command, prints `BIN=<binary>` and launches nothing), so the probe refuses exactly what a dispatch refuses. The binary is found past leading assignments and `env`, not through other wrappers such as `nice` or `timeout`. The command is printed on the launch line and recorded in `RUNDIR/routing`, so keep credentials out of it. `PI_BIN`, `PI_PROVIDER`, `PI_MODEL` and `PI_EXTRA_ARGS` were its predecessors; any of them set is refused with exit 2 rather than ignored, since a leftover model pin would otherwise run on a model nobody chose. The launch prints the command as `CMD=<command>` on its own line, after `CWD=<dir> WRITABLE=<list>`, so a run on the wrong provider shows at launch rather than at the end.

`PI_DISPATCH_CMD` is also how a provider survives a pi release it was not built for. pi 0.86.0 normalized provider stream inputs to `TranscriptContext`, so a third-party provider still reading `context.tools` now sends an empty tool list; `@rahularya01/pi-cursor` 1.4.34 is one. Measured on 0.86.0, every Cursor request leaves with no tools, the model falls back to Cursor's own native frames, the git shim is the only fence left (pi sees no tool calls, so `extensions/worktree-fence.ts` and `pi-poll.sh` are both blind), and a native shell frame never ends the turn: the worker writes its files and then stalls until a liveness guard kills it. The same worker on a pinned pi 0.85.1 runs Cursor through pi's own `bash` and `write` tools, the fence refuses a path outside the worktree, and the run ends `STATUS=OK`. Until the provider reads tools the new way, name a pinned 0.85.1 binary in `PI_DISPATCH_CMD` for Cursor routing and leave the interactive pi on the current release.

`PI_CWD` is the directory the worker is launched in, and a fresh dispatch without it is refused with exit 2 (pi has no `--cwd` flag and would otherwise take the caller's directory: a worker that starts in the caller's checkout puts every bare `git` command there). Set it to the worktree; `PI_CWD="$PWD"` is the deliberate way to run a worker where the caller stands. It is recorded as `CWD=` in `RUNDIR/routing` and replayed on resume, the record beating the env like the command does; pi keys a session on the directory it started in and would otherwise stop at a "fork this session?" prompt nobody can answer. A prior run recorded before `CWD=` existed resumes in its session header's cwd. A recorded directory that no longer exists (a cleaned-up worktree) fails the dispatch with exit 2 rather than resuming somewhere else. The dispatcher also fences every worker: `shims/git` goes first on the worker's PATH (with `PI_REAL_GIT` naming the real binary) and refuses every git verb not known to be read-only against any repo outside `PI_CWD` — it sees the shell-expanded argv, expands aliases, and checks both the top level and the git dir, so quoted paths, variables, subshells, `bash -c`, `GIT_DIR=`, `config --global` and `remote` writes are all covered. Inside a linked worktree of the human's checkout, commits stay on the worktree's branch and pass, while verbs that rewrite the refs both share (branch delete, `update-ref`, `tag`, `worktree prune`, `gc`) are refused. Anything under the per-user temp dir passes so test fixtures built with `mktemp` keep working. `extensions/worktree-fence.ts` is loaded with `-e` and refuses `write`/`edit` outside the worktree. On macOS the whole worker process tree additionally runs under `sandbox-exec` with a profile written to `RUNDIR/sandbox.sb`: writes are denied everywhere except the worktree, the run dir, the per-user temp and cache dirs, pi's and omp's own state (`~/.pi`, `~/.omp`, and `$PI_CODING_AGENT_DIR` as exported to the dispatch itself; an agent dir named only inside `PI_DISPATCH_CMD` is not admitted, so keep it under `~/.pi` or `~/.omp`, or export it too), and the shared git dir a linked worktree commits through — so `/usr/bin/git` by absolute path, a rewritten `PATH`, `gh`, libgit2 and plain shell writes outside the worktree all fail with "Operation not permitted". `PI_SANDBOX=0` turns the sandbox off. Off macOS, tools that do not call PATH's `git` remain uncovered.

The command is recorded as `CMD=` in `RUNDIR/routing` and replayed on resume: a follow-up turn that names a `PRIOR_RUNDIR` runs on the binary and agent dir that wrote the session, whatever the env says now, and the session itself carries the model (measured on pi and omp: `--session` without `--model` resumes on the session's model). A run recorded before `CMD=` existed resumes on the env command, with a warning.

## Environment

`PI_DISPATCH_CMD`, `PI_CWD` and `PI_SANDBOX` are described above. The rest:

| variable | read by | what it does |
|---|---|---|
| `PI_WRITABLE_FILES` | `pi-dispatch.sh` | Colon-separated absolute paths of extra files outside `PI_CWD` the worker may write (a report, a verdict file). Each file gets an exact sandbox rule and a write/edit fence exception; a sibling in the same directory stays denied. Empty segments are skipped. An entry that is relative, has no existing parent directory, contains `"` or `\`, or names a directory, or a list containing a newline, is refused with exit 2 before any `RUNDIR` exists. Recorded as `WRITABLE=` in `RUNDIR/routing`, shown on the launch line, and replayed on resume: the record beats the env, even when empty. |
| `PI_PROMPT` | `pi-dispatch.sh` | The prompt passed to pi after the brief. Default: `Read the brief above and complete it. Output only the result.` |
| `PI_WALL_CLOCK_S` | `pi-poll.sh` | Hard elapsed ceiling for a live run before it is killed as `TIMEOUT`. Default 900; `pi-run.sh` sets it to its deadline. |
| `PI_STALL_THRESHOLD_S` | `pi-poll.sh` | Seconds a live run may go without output before it is killed as `STALL`. Default 300. |
| `PI_NO_MARKER_GRACE_S` | `pi-poll.sh` | Seconds a dead run may go without an `rc` file before it fails as `no-rc`. Default 30. |
| `PI_RUN_DEADLINE_S` | `pi-run.sh` | Deadline for the whole call when `--deadline` is not given. Default 480. |
| `PI_POLL_INTERVAL_S` | `pi-run.sh` | Seconds between polls. Default 5. |

## Scaling to N parallel tasks (dispatch → review)

Dispatch is non-blocking, so fan-out is just N launches:

1. Claude decomposes work into self-contained briefs (one observable outcome each).
2. For code-writing tasks, `pi-worktree.sh create` one worktree per task; put the worktree path in the brief (worker uses absolute paths, never cd out).
3. Launch each brief with `pi-dispatch.sh` (each returns instantly) — directly, or hand the whole fan-out to one `builder` agent.
4. Poll each RUNDIR until terminal; failures carry diagnostics in `RUNDIR/pi.stderr.log`.
5. `pi-worktree.sh clean` captures each task's diff; Claude reviews diffs/results against the brief's contract and merges or re-dispatches (resume via `PRIOR_RUNDIR` keeps the worker's session context).

Context hygiene: main never reads worker streams or source material — only briefs out, distilled summaries and diffs back. Each worker sees only its own brief and worktree.

## Prerequisites

- `pi` installed and authenticated (`pi` → `/login`), `jq`, `git` (for worktrees).

## Tests

From the repository root, `bash tests/run-all.sh` runs every suite below, the bun suite, and the context-flow suites, printing one `ok`/`not ok` line per suite and `suites: N, failed: M` last.

Each suite also runs alone from this directory as `bash tests/<name>`: `cmd-test.sh`, `wrapper-test.sh`, `cwd-test.sh`, `shim-test.sh`, `poll-test.sh`, `worktree-cleanup-test.sh`, `probe-watch-test.sh`, `agent-test.sh`, `run-test.sh`, `writable-test.sh`, `builder-seat-test.sh` and `prose-test.sh`. All are pure-local, no network (agent-test, cwd-test and writable-test use a bash shim in place of `pi`; shim-test runs real git against scratch repos; prose-test reads the docs). `bun test extensions/` covers the write/edit fence.
