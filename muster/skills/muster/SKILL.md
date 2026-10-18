---
name: muster
description: Dispatch unattended Claude worker sessions over ACP from the main session, then watch them, answer their permission questions, follow up, collect their reports, and clean up. Use when the user asks to dispatch a worker, run a ticket in the background, or delegate work to a headless worker.
---

# Muster: coordinate unattended workers

Run these commands from the main session only. Background completions wake the main session, not a subagent, so the wait loop belongs there.

Each worker is a Claude session in its own git worktree on branch `muster/NAME`. NAME is the run name you choose; it must match `^[a-z0-9][a-z0-9-]{0,39}$`.

## Dispatch

Dispatch blocks until the worker ends, so start it with `Bash(run_in_background: true)`. `--model` must name a specific model; `default` is refused.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts run --name NAME --model MODEL --repo /abs/path/to/repo --ticket "TICKET TEXT"
```

Use `--ticket-file PATH` instead of `--ticket` for a long ticket. Use `--base REF` to start from a ref other than HEAD. The first stdout line is `RUNDIR=<path>`; keep that path for collect.

## Wait

Start `watch` through `Bash(run_in_background: true)`; it prints one line per state change and exits when the run needs you or ends. Monitor can stream the same output when it is available.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts watch NAME
```

It exits on `question`, `idle`, `done`, `blocked`, `malformed`, or `dead`. To read the state once, run:

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts status NAME
```

## Answer

When the state is `question`, decide and answer it. The only decisions are `allow` and `deny`; a decision covers that one request.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts answer NAME allow
```

Add `--n N` when more than one question is pending. Then wait again.

## Follow up

When the state is `idle`, send the worker its next instruction. A `dead` or exited run refuses follow-ups.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts followup NAME "NEXT INSTRUCTION"
```

Use `followup NAME --file PATH` for longer text. Then wait again.

## Collect

When the state is `done`, read the report and the worker's commits from the repository:

```
cat "<RUNDIR>/REPORT.md"
git log muster/NAME
```

If the state is `blocked` or `malformed`, read `REPORT.md` the same way before deciding what to do.

## Stop

Stop asks the worker to end; it does not end it at once. Run `watch` until it reports a terminal state.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts stop NAME
```

## Cleanup

After the run has exited, remove its worktree with a plain `git worktree remove`; never add `--force`. The path is the `worktree` field in `<RUNDIR>/meta.json`. The branch `muster/NAME` stays, so `git log muster/NAME` still works.

```
cd /abs/path/to/repo && git worktree remove "<worktree path from meta.json>"
```

If remove refuses, the worktree holds uncommitted changes. Read them before deciding; do not force.

## Fence limits

A worker does not get the main session's permissions.

- Worker Bash runs only read-only commands (ls, cat, grep, git status, git log, and similar), `bun test`, and `git add` or `git commit`.
- `bun test` and git commit hooks are not fenced; whatever they run is outside the fence.
- Worker writes are limited to its own worktree and its report file.
- The worker's permission requests reach you as `question` states. You answer `allow` or `deny` only; there is no session-wide grant.
- The worker runs the model you named, in default permission mode, and loads no user or project settings.
