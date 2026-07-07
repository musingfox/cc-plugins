---
name: pi-dispatch
description: Offload dispatch to cheap/fast omp models via pi-agent.sh — name-addressed sub-agent verbs (start/send/poll/peek/ls/stop/watch) over background omp workers with idempotent poll, worktree isolation, and distilled reports. Main loads this to write the offload usage it embeds in a builder brief.
---

# pi-dispatch — offload usage

`scripts/pi-agent.sh` is the name-addressed unified entry point over the omp
worker primitives. The registry is the filesystem: `$PI_RUNS_DIR/agents/<NAME>`
symlinks to the run's RUNDIR. Main (the orchestrator) loads this usage and
embeds it verbatim into a builder brief when offloading; the builder operates
the verbs as a pure operator.

## Verbs

| verb | command | purpose |
|---|---|---|
| dispatch a worker | `pi-agent.sh start NAME [--acp] [--profile P] [BRIEF]` | launch a batch (or interactive ACP) worker in the background |
| follow-up turn | `pi-agent.sh send NAME TEXT_OR_FILE` | resume a finished worker's session with context (SendMessage semantics); on an ACP session, start the next turn |
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
   its main loop; relay `PERMISSION` lines back to main, and run each
   worker's acceptance check when it settles.
3. Terminal verdicts persist in the RUNDIR and replay on re-poll; raw stream
   is kept as `pi.stream.jsonl`, distilled final text as `result.md`.

## Profile routing

`profiles.conf` maps profile names to omp models. Precedence:
`PI_PROVIDER`/`PI_MODEL` env > `--profile`/`PI_PROFILE` > default
(`grok-build`). Pick `fast` for mechanical work, `balanced` for ordinary
implementation, `careful` for harder reasoning; the reviewer's profile must
be ≥ the builder's.

## Prerequisites

`omp` installed and authenticated (`omp` → `/login`), `jq`, `git` (for
worktrees). Probe with `pi-probe.sh` before first dispatch in a session.