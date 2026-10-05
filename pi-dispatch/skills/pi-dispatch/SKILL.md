---
name: pi-dispatch
description: >-
  This skill should be used when the user asks to "offload this", "dispatch to pi",
  "run this on a cheap model", "fan these tasks out to pi workers", "save tokens on this
  grunt work", or when the main thread is about to write a builder brief that hands
  work to a background worker. Offload dispatch to cheap/fast pi models via
  the pi-agent script — name-addressed sub-agent verbs (start/send/poll/peek/ls/stop/watch)
  over background pi workers with idempotent poll, worktree isolation, and distilled
  reports. Main loads this to write the offload usage it embeds in a builder brief.
---

# pi-dispatch — offload usage

`${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh` is the name-addressed unified entry point over the pi
worker primitives. The registry is the filesystem: `$PI_RUNS_DIR/agents/<NAME>`
symlinks to the run's RUNDIR. Main (the orchestrator) reads this whole file; the
`## Operator usage` section at the end is what it embeds into a builder brief,
and the builder operates those verbs as a pure operator.

## How main uses this

1. Decompose the work into self-contained briefs (one observable outcome
   each). For code-writing tasks, create one worktree per task, put its
   ABSOLUTE path in the brief, and launch with
   `PI_CWD=<worktree> ${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh start …`. The brief tells the worker
   where to work; only `PI_CWD` makes it start there, and it is what arms the
   worktree fence (git shim + write/edit extension). A fresh dispatch
   without it is refused (exit 2). To run a worker in the current directory
   on purpose, say so with `PI_CWD="$PWD"`. Every `create` flag is required:

   ```bash
   ${CLAUDE_PLUGIN_ROOT}/scripts/pi-worktree.sh create \
     --repo_root <repo root> --branch_name <new branch> \
     --base_ref <BASE_REF sha> --base_branch <branch to diff against> \
     --work_path <worktree path> --diff_out <diff file> \
     --cleanup_out <cleanup script> --rundir-file <rundir file>
   ```

   It prints the worktree path and appends a cleanup block to
   `<cleanup script>`. After `start`, write the worker's RUNDIR into
   `<rundir file>` (`start` prints it as `RUNDIR=…`; pipe through
   `sed -n 's/^RUNDIR=//p'`) so cleanup can kill a live worker; an empty
   file skips the kill. When the work is merged or dropped, run
   `${CLAUDE_PLUGIN_ROOT}/scripts/pi-worktree.sh clean <cleanup script>`: it saves the diff to
   `<diff file>` and removes the worktree.
2. Embed the `## Operator usage` section — from its heading to the end of
   this file — verbatim, plus the per-task brief, into a builder dispatch.
   The builder runs `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh start` per task and `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh watch` as
   its main loop, and runs each worker's acceptance check when it settles.
3. Terminal status lines persist in the RUNDIR and replay on re-poll; raw stream
   is kept as `pi.stream.jsonl`, distilled final text as `result.md`.
4. `stop NAME` once a worker's result is consumed. The registry never
   self-prunes, and every `watch` re-prints each of ITS named terminal agents
   on its first sweep.
5. `watch` requires the names because the registry is machine-wide: an
   unscoped watch would report on — and quota-abort — another dispatch's
   workers. `ls` is the global view.
6. When a batch ends on `QUOTA` or `QUOTA-WINDOW` (see the provider wall
   below), re-dispatch the SAME brief, minus the operator usage, to a Claude
   builder in self-do mode (`${CLAUDE_PLUGIN_ROOT}/docs/main-orchestration.md` §6) on the same
   worktree. One shot: if that fails too, the task is failed.

## Waiting without burning tokens

Never poll from a Bash loop in the main thread — every poll is a tool call.
Start the workers, then arm ONE blocking watch:

From main, run `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh watch` as a background task (`Bash(run_in_background: true)`) and follow it with Monitor; a sub-agent cannot be woken that way, so it runs `watch` in the foreground.

```
Bash(command: "${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh watch 15 NAME1 NAME2 …", run_in_background: true)
```

The command exits when nothing is in flight; the completion notification
carries one line per state change. A
sub-agent with a single worker can use `${CLAUDE_PLUGIN_ROOT}/scripts/pi-run.sh` instead.

A terminal line from a run whose stream carries usage includes
`model=<provider/model> cost=$<sum> turns=<n>` summed over the whole run; the
`empty`, `no-rc`, `handle=broken` and `no-pid` lines carry none. Read it: a small task that shows 4 turns at ~20K
input each is paying the full prompt every tool call (no cache on some
providers). Trim by appending `-nc -ns -np --tools read,bash,edit,write` to
`PI_DISPATCH_CMD` (measured 21.4K → 12.8K input/turn) — at the price of the dispatch-dir
AGENTS.md and extension tools, so it is opt-in.

## Routing

Routing is one environment variable, `PI_DISPATCH_CMD`: the agent command,
expanded by bash like a shell line, ahead of the dispatch's own flags:

```bash
PI_DISPATCH_CMD='pi --model <provider>/<model>' ${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh start NAME BRIEF
PI_DISPATCH_CMD='env PI_CODING_AGENT_DIR=$HOME/.omp/agent omp --model <provider>/<model>' ${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh start NAME BRIEF
```

It is required: unset, a fresh dispatch exits 2. A command without `--model`
runs on the agent's own `settings.json` (pi: `$PI_CODING_AGENT_DIR`, else
`~/.pi/agent`). The agent must speak pi's CLI and json stream (pi and omp do).
The retired `PI_BIN`, `PI_PROVIDER`, `PI_MODEL` and `PI_EXTRA_ARGS` are refused
with exit 2 when set. The launch prints the command as `CMD=<command>`; check
it before assuming a model.

### When it is missing: set it up with the human

When `${CLAUDE_PLUGIN_ROOT}/scripts/pi-probe.sh` prints `ERROR:PI_DISPATCH_CMD is not set`, or an `ERROR:`
naming a retired variable, do not dispatch and do not fall back silently:

1. See what is installed: `command -v pi omp`. Use the absolute paths it
   prints; a subagent's PATH is not guaranteed.
2. Ask with `AskUserQuestion` which agent and model workers run on. Offer
   only installed agents and models they list (`<pi path> --list-models`),
   as `<pi path> --model <provider>/<model>`, or
   `env PI_CODING_AGENT_DIR=$HOME/.omp/agent <omp path> --model <provider>/<model>`
   for omp (its own agent dir, under `~/.omp` so the sandbox admits it).
   When a retired variable is set, offer its translation first
   (`PI_PROVIDER=a PI_MODEL=b` → `--model a/b`, `PI_BIN` → the binary).
3. Probe the chosen command inline: `PI_DISPATCH_CMD='<choice>' ${CLAUDE_PLUGIN_ROOT}/scripts/pi-probe.sh`.
   Not `OK` → show the line and ask again.
4. Ask whether to keep it. On yes, edit `~/.claude/settings.json`: set
   `env.PI_DISPATCH_CMD` to the choice and delete the retired keys. Write
   `$HOME` literally; bash expands it at launch. It takes effect in the next
   session, so for this one prefix `PI_DISPATCH_CMD='<choice>'` on every
   `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh` and `${CLAUDE_PLUGIN_ROOT}/scripts/pi-probe.sh` call.

The command is recorded per run and replayed on resume, so `send` keeps the
worker on the binary it started with, and the session keeps its model.

Pick the reviewer's model to be at least as capable as the builder's — there
is no ranked list to defer to, so that judgement is main's.

## Prerequisites

`pi` installed and authenticated (`pi` → `/login`), `jq`, `perl` (the
detached launch and watchdogs), `git` (for worktrees). Probe with
`${CLAUDE_PLUGIN_ROOT}/scripts/pi-probe.sh` before first dispatch in a session.

## Operator usage

The dispatcher is whoever runs `start`: the builder, or main when it
dispatches directly.

### Output contract — required in every brief

Never extract a verdict by parsing a transcript or a session jsonl. Name the
verdict file in the brief instead, and make the worker verify before claiming:

> Run the acceptance check yourself first. Then write the result to
> `/abs/path/verdict.md` as exactly one line:
> `STATUS=DONE <check command + exit code>` — the check passed under you —
> or `STATUS=BLOCKED <what is missing and what you need>` — you cannot
> proceed. Do not print it in the terminal. Reply only `DONE`.

The worker may write only inside `PI_CWD`. When the verdict path lies outside
it, declare the file at launch; otherwise the write/edit fence refuses it, and
on macOS so does the sandbox outside its allowed directories:

```bash
PI_CWD=<worktree> PI_WRITABLE_FILES=/abs/path/verdict.md ${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh start NAME BRIEF
```

`PI_WRITABLE_FILES` takes colon-separated absolute file paths whose directory
already exists; the worker may write each named file and nothing beside it.

The dispatcher routes on that line without reading anything else:

- `DONE` → independent review (the dispatcher re-runs the check; a mismatch
  with the worker's claim is itself a high-signal finding)
- `BLOCKED` → replan — the worker is saying the brief is wrong, not the work
- file absent + process dead → mechanical failure; the cause (quota, auth,
  model) lives in the stream, no judgement seat needed

### Verbs

| verb | command | purpose |
|---|---|---|
| dispatch a worker | `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh start NAME BRIEF` | launch a worker in the background |
| follow-up turn | `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh send NAME TEXT_OR_FILE` | resume a finished worker's session with context (SendMessage semantics) |
| status poll | `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh poll NAME` | one-shot one-line status: `RUNNING` or a terminal `STATUS=OK\|FAIL …` |
| activity snapshot | `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh peek NAME` | one-shot agent-view snapshot of a live run |
| agent panel | `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh ls` | list registered agents + their state |
| cancel | `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh stop NAME` | idempotent group-kill + unregister |
| background notifications | `${CLAUDE_PLUGIN_ROOT}/scripts/pi-agent.sh watch INTERVAL NAME…` | BLOCKING; polls the NAMED agents only, prints one line per meaningful state change, exits when none is in flight |

### The provider wall → abort early, roll back, fall back to Claude

A worker that hits the provider's spend wall is killed on the first such
`errorMessage`, before pi's retries cost anything, and tagged on its terminal
line as one of two classes:

| tag | what it means | can a later batch route to pi? |
|---|---|---|
| `QUOTA` | balance or plan exhausted | no — only paying clears it |
| `QUOTA-WINDOW` | a rolling usage window ("usage limit … resets at") | yes, once it resets (hours) |

`watch` then stops the siblings **it was given** and stamps them
`STATUS=FAIL … <tag> sibling-abort`, carrying the same class the wall was
reported with — they share the wall. On either tag:

1. Do not re-dispatch to pi **for this batch** — the wall does not move while
   it runs. The scope is the batch, not the session: a later dispatch is free
   to try pi again, and after `QUOTA-WINDOW` it will likely succeed.
2. Roll back each aborted worker's half-done edits in its worktree `WT`, but
   only when `WT` is a linked worktree from
   `${CLAUDE_PLUGIN_ROOT}/scripts/pi-worktree.sh create`. A worker run with
   `PI_CWD="$PWD"` sits in the user's own checkout: report QUOTA and leave it
   untouched. Keep the `reset` line only if the worker was allowed to commit
   (`BASE_REF` is the ref `pi-worktree.sh create` was given):

   ```bash
   if [ "$(git -C "$WT" rev-parse --path-format=absolute --git-dir)" != \
        "$(git -C "$WT" rev-parse --path-format=absolute --git-common-dir)" ]; then
     git -C "$WT" reset --hard "$BASE_REF"
     git -C "$WT" checkout -- . && git -C "$WT" clean -fd
   else
     echo "QUOTA: $WT is not a linked worktree; left untouched"
   fi
   ```

   A worker's partial state is not reviewable; the fallback starts clean.
3. Report the tag to main; main re-dispatches the task to a Claude builder.
