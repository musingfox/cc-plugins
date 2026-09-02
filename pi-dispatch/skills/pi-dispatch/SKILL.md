---
name: pi-dispatch
description: Offload dispatch to cheap/fast pi models via pi-agent.sh — name-addressed sub-agent verbs (start/send/poll/peek/ls/stop/watch) over background pi workers with idempotent poll, worktree isolation, and distilled reports. Main loads this to write the offload usage it embeds in a builder brief.
---

# pi-dispatch — offload usage

`scripts/pi-agent.sh` is the name-addressed unified entry point over the pi
worker primitives. The registry is the filesystem: `$PI_RUNS_DIR/agents/<NAME>`
symlinks to the run's RUNDIR. Main (the orchestrator) loads this usage and
embeds it verbatim into a builder brief when offloading; the builder operates
the verbs as a pure operator.

## Output contract — required in every brief, on either control plane

Never extract a verdict by parsing a transcript or a session jsonl. Name the
artifact in the brief instead, and make the worker verify before claiming:

> Run the acceptance check yourself first. Then write the result to
> `/abs/path/verdict.md` as exactly one line:
> `STATUS=DONE <check command + exit code>` — the check passed under you —
> or `STATUS=BLOCKED <what is missing and what you need>` — you cannot
> proceed. Do not print it in the terminal. Reply only `DONE`.

The caller routes on that line without reading anything else:

- `DONE` → independent review (the caller re-runs the check; a mismatch with
  the worker's claim is itself a high-signal finding)
- `BLOCKED` → replan — the worker is saying the brief is wrong, not the work
- file absent + process dead → mechanical failure; the cause (quota, auth,
  model) lives in the stream, no judgement seat needed

This is stronger than a process exit code — `rc=0` proves the process did not
crash, not that the work is done — and a self-verified `DONE` is stronger than
an unverified one: the round trip a caller would burn discovering a failed
check happens inside the worker's own session instead.

## Control plane — herdr by default, `pi-agent.sh` as the fallback

Two control planes drive the same pi workers. Decide once, at the start of a
dispatch:

```bash
test "${HERDR_ENV:-}" = 1
```

**Inside herdr — use it.** This is the default, not a preference. **Load the
`herdr` skill first** (or run
`herdr --skill`): it does not auto-trigger on delegation intent, so main must
request it explicitly before issuing any `herdr` command. Then:

```bash
herdr pane split --current --direction right --cwd <ABS_DIR> --no-focus
herdr agent start NAME --kind pi --pane <PANE_ID>
herdr agent prompt NAME <BRIEF> --wait --timeout <MS>
```

A worker that dies mid-turn fails the waiting call at once with
`agent_not_running` (rc=1) instead of hanging to the timeout.
`herdr worktree create --cwd <REPO> --branch <NAME>` replaces
`pi-worktree.sh create` for isolation — but its `remove --force` deletes a live
worktree without killing the worker or capturing the diff, so commit the work
(or capture the diff) before removing.

**Outside herdr** — cron, CI, the web and IDE clients, any Claude not launched
from a herdr pane — use the verbs below. This is the fallback path, and the one
cf's own scripts sit on (they call `pi-dispatch.sh` directly, and no CLI-less
harness tool can reach them).

## Verbs

| verb | command | purpose |
|---|---|---|
| dispatch a worker | `pi-agent.sh start NAME BRIEF` | launch a worker in the background |
| follow-up turn | `pi-agent.sh send NAME TEXT_OR_FILE` | resume a finished worker's session with context (SendMessage semantics) |
| status poll | `pi-agent.sh poll NAME` | one-shot one-line status: `RUNNING` or a terminal `STATUS=OK\|FAIL …` |
| activity snapshot | `pi-agent.sh peek NAME` | one-shot agent-view snapshot of a live run |
| agent panel | `pi-agent.sh ls` | list registered agents + their state |
| cancel | `pi-agent.sh stop NAME` | idempotent group-kill + unregister |
| background notifications | `pi-agent.sh watch [INTERVAL]` | BLOCKING; polls every registered agent, prints one line per meaningful state change, exits when nothing is in flight |

## How main uses this

1. Decompose the work into self-contained briefs (one observable outcome
   each). For code-writing tasks, create one worktree per task with
   `pi-worktree.sh create` and put its ABSOLUTE path in the brief.
2. Embed this usage section + the per-task brief into a builder dispatch.
   The builder runs `pi-agent.sh start` per task and `pi-agent.sh watch` as
   its main loop, and runs each worker's acceptance check when it settles.
3. Terminal verdicts persist in the RUNDIR and replay on re-poll; raw stream
   is kept as `pi.stream.jsonl`, distilled final text as `result.md`.

## Routing

Routing is `PI_PROVIDER` + `PI_MODEL` in the environment, passed to pi as one
`--model provider/model` spec:

```bash
PI_PROVIDER=openai-codex PI_MODEL=gpt-5.4-mini pi-agent.sh start NAME BRIEF
```

Give none and pi resolves from its own `~/.pi/agent/settings.json`.

Routing is recorded per run and replayed on resume, so `send` keeps the worker
on the model it started with. Pick the reviewer's model to be at least as
capable as the builder's — there is no ranked list to defer to, so that
judgement is the dispatcher's.

## Prerequisites

`pi` installed and authenticated (`pi` → `/login`), `jq`, `git` (for
worktrees). Probe with `pi-probe.sh` before first dispatch in a session.