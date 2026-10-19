---
name: muster
description: Dispatch unattended Claude worker sessions over ACP from the main session, then watch them, answer their permission questions, follow up, collect their reports, and clean up. Use when the user asks to dispatch a worker, run a ticket in the background, or delegate work to a headless worker.
---

# Muster: coordinate unattended workers

Run these commands from the main session only. Background completions wake the main session, not a subagent, so the wait loop belongs there.

Each worker is a Claude session in its own clone of the repository (called the worktree below, under the run directory), on branch `muster/NAME`. Muster fetches that branch back into the repository each time the worker goes idle and when the run ends, so `git log muster/NAME` works from the repository. NAME must not already be a branch in the repository; a taken name is refused. NAME is the run name you choose; it must match `^[a-z0-9][a-z0-9-]{0,39}$`.

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

When the state is `done`, read the report and the worker's commits from the repository. A report state appears only after the branch fetch-back has finished; a `fetch-error=` field on the status line means it failed and the branch may be missing:

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

After the run has exited, remove its run directory; this deletes the clone, the event log and the report. Branch `muster/NAME` stays in the repository, so `git log muster/NAME` still works. Read the report first. If `phase.json` in the run directory has a `fetchError`, the branch could not be fetched back and the commits exist only in the clone at `<RUNDIR>/worktree`; fetch them by hand before removing it.

```
rm -rf "<RUNDIR>"
```

## Confinement

A worker does not get the main session's permissions.

- Bash runs inside Claude Code's OS sandbox. Writes are confined to the worker's worktree and the system temp directories, which stay writable, plus `<RUNDIR>/cache`, where `npm_config_cache` and `BUN_INSTALL_CACHE_DIR` point so package installs work. Reads are not confined except for credential stores, which the sandbox denies: `~/.npmrc`, `~/.config/gh`, `~/.git-credentials`, `~/.config/git/credentials`, `~/.netrc`, `~/.aws`, `~/.docker/config.json`, `~/Library/Keychains`. `muster run` refuses a `--repo` or `MUSTER_HOME` under `/tmp`, `/private/tmp` or `$TMPDIR`, because the sandbox leaves those writable and a worker could then write the repository's refs or answer its own questions.
- The worker's tools are a fixed list (Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, ToolSearch), with claude.ai connectors off.
- File tools are fenced by path. A file request outside the worktree, or inside the worktree's `.git` or `.claude` directory, becomes a `question` for you.
- Network is limited to the default hosts: `registry.npmjs.org`. github.com is off the list because a worker can read your git credentials and would otherwise be able to push as you. Hosts listed in `MUSTER_ALLOW_HOSTS` are added to them, set in the environment of `muster run`:

```
MUSTER_ALLOW_HOSTS=pypi.org,files.pythonhosted.org bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts run --name NAME --model MODEL --repo /abs/path/to/repo --ticket "TICKET TEXT"
```

- A request for any other host, a web fetch outside the list, and every web search is refused without a `question`. A worker that cannot proceed ends the run `BLOCKED`, and its report names the host.
- The worker runs the model you named, in default permission mode, and loads no user or project settings.
