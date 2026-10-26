---
name: muster
description: Dispatch unattended Claude worker sessions over ACP from the main session, then watch them, answer their permission questions, follow up, collect their reports, and clean up. Use when the user asks to dispatch a worker, run a ticket in the background, or delegate work to a headless worker.
---

# Muster: coordinate unattended workers

Run these commands from the main session only. Background completions wake the main session, not a subagent, so the wait loop belongs there.

Each worker is a Claude session in its own clone of the repository (called the worktree below, under the run directory), on branch `muster/NAME`. Muster fetches that branch back into the repository each time the worker goes idle and when the run ends, so `git log muster/NAME` works from the repository. The clone keeps the repository's local `core.hooksPath`, so the repository's hooks run on the worker's commits. NAME must not already be a branch in the repository; a taken name is refused. NAME is the run name you choose; it must match `^[a-z0-9][a-z0-9-]{0,39}$`.

Requires Bun, Node 22 or later, and git. `run` starts each worker through the ACP adapter `@agentclientprotocol/claude-agent-acp`, which `bunx` fetches from registry.npmjs.org at the version pinned in `src/launch.ts`; the adapter declares Node 22 or later, and `bunx` runs it under `node`. Check with `bun --version` and `node --version` before the first dispatch.

## Dispatch

Dispatch blocks until the worker ends, so start it with `Bash(run_in_background: true)`. `--model` takes one of these values; pick by the shape of the ticket, and go one step up when in doubt:

| `--model` | `--effort` | Model | Fits a ticket that |
|---|---|---|---|
| `haiku` | `medium` | Haiku 5.5 | answers a known question from the code or docs, or makes a mechanical change checked against a stated red/green test |
| `sonnet` | `medium` | Sonnet 5.5 | implements a pinned contract |
| `sonnet` | `high` | Sonnet 5.5 | runs many easy checks across a wide scope, or explores from a known starting point |
| `opus` | `high` | Opus 5.5 | hinges on one hard judgment |
| `opus` | `xhigh` | Opus 5.5 | enters unknown territory, plans, or verifies another worker's output |
| `fable` | `high` | Fable 5.1 | stays hard after an `opus` attempt failed for lack of judgment, not for missing context |

The model sets the ceiling of what the worker can judge correctly; effort sets how far it searches and checks within it. A worker that is confidently wrong needs a stronger model; one that stops short or skips a check needs more effort first. Never use `low` with `haiku` or `sonnet`.

Use these aliases, not full IDs: the adapter offers the newest models only under them, a full ID such as `claude-opus-5` is an older generation, and the session's own ID such as `claude-opus-5-5` is refused. `default` is refused too. `--effort` is optional; without it the worker runs at the adapter's default for that model (`high` for `haiku` in a real run). An effort the chosen model does not offer is refused. A refused model or effort's report lists every offered value with its display name.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts run --name NAME --model MODEL [--effort EFFORT] [--unfenced] --repo /abs/path/to/repo --ticket "TICKET TEXT"
```

Use `--ticket-file PATH` instead of `--ticket` for a long ticket. Use `--base REF` to start from a ref other than HEAD. The worker's Bash runs inside the OS sandbox; add `--unfenced` to run it outside, for a ticket whose checks the sandbox cannot run, such as a suite that starts its own `sandbox-exec`; see Confinement. The first stdout line is `RUNDIR=<path>`; keep that path for collect.

## Wait

Start `watch` through `Bash(run_in_background: true)`; it prints one line per state change and exits when the run needs you or ends. Monitor can stream the same output when it is available.

With Claude Code 2.1.304 or later, a band above the prompt lists the in-flight runs of this repository, each with its state, its title and its task-list progress as `done/total`; its header counts running, question, idle and finished runs, and shows `N to collect` beside them while finished runs wait for collection.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts watch NAME
```

It exits on `question`, `idle`, `done`, `blocked`, `malformed`, or `dead`. To read the state once, run:

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts status NAME
```

The status line carries `deps=<copied>/<total>` when the run records its dependency directories: how many of the directories holding a lockfile were copied into the worker's worktree, out of how many hold one. `deps=0/0` means none holds a lockfile.

Once a run has exited, the last fields of its status line are `exit-reason=<reason>` and, when the exit had a detail, `exit-detail=` followed by the detail as a JSON-quoted string. They appear whatever `REPORT.md` says, so a `done` run that later exited on the idle timeout carries them too; a run that has not exited carries neither.

## Answer

When the state is `question`, decide and answer it. The only decisions are `allow` and `deny`; a decision covers that one request.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts answer NAME allow
```

Add `--n N` when more than one question is pending. Then wait again. A question left unanswered for 30 minutes ends the run. If `REPORT.md` is missing or malformed, muster writes a `BLOCKED` one with `question-timeout` as the reason and the run ends `blocked`; a report the worker already wrote stands, so a `DONE` report ends the run `done`. Set `MUSTER_QUESTION_TIMEOUT_MS` in the environment of `muster run` to change the limit.

## Follow up

When the state is `idle`, send the worker its next instruction. A `dead` or exited run refuses follow-ups. A run left 15 minutes without a follow-up after its last turn exits, a `done` run included; set `MUSTER_IDLE_TIMEOUT_MS` in the environment of `muster run` to change that, or end it sooner with `stop`.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts followup NAME "NEXT INSTRUCTION"
```

Use `followup NAME --file PATH` for longer text. Then wait again.

A run that exited on the idle timeout without a report still shows `state=idle`, with `exit-reason=idle-timeout` at the end of its status line; that field is how you tell it apart from a live idle run. Its background `run` task has also finished, and `<RUNDIR>/phase.json` holds `"phase":"exited"` and `"reason":"idle-timeout"`; `followup` refuses it with `client exited; cannot follow up`. Its branch was fetched back as it exited, unless the fetch failed; `clean` checks the branch itself. Review `git log <baseSha>..muster/NAME`, then either dispatch a new run under a new NAME, adding `--base muster/NAME` to continue from its commits, or go to Cleanup.

## Collect

When the state is `done`, read the report and the worker's commits from the repository. A report state appears only after the branch fetch-back has finished; a `fetch-error=` field on the status line means it failed and the branch may be missing:

```
cat "<RUNDIR>/REPORT.md"
git log <baseSha>..<head sha>
```

The status line of a `done` run carries `head=<sha>`, the commit the branch pointed at when the run became done. Review and merge that sha, not the branch name: a command the worker left running can still rewrite `muster/NAME` afterwards. `<baseSha>` is `baseSha` in `<RUNDIR>/meta.json`, so the commits you review are the ones you merge. The status line of a `done` run also carries `deps=` as described under Wait.

If the state is `blocked` or `malformed`, read `REPORT.md` the same way before deciding what to do.

If the state is `dead`, the `muster run` process is gone without finishing the run, or `phase.json` is missing, is not a JSON object, or holds a `phase` value muster does not recognise (all three show `reason=phase-unreadable`). Read `REPORT.md` if it exists. The branch holds at most what the last idle fetched back; later commits exist only in `<RUNDIR>/worktree`. Before Cleanup, fetch them into the repository with the same fetch muster runs, where `/abs/path/to/repo` is the `--repo` path (`repoRoot` in `<RUNDIR>/meta.json`):

```
git -C /abs/path/to/repo -c fetch.fsckObjects=true fetch -q --no-tags --no-recurse-submodules "<RUNDIR>/worktree" +refs/heads/muster/NAME:refs/heads/muster/NAME
```

## Stop

Stop asks the worker to end; it does not end it at once. Run `watch` until it reports a terminal state.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts stop NAME
```

## Cleanup

After the run has exited, remove its run directory with `clean`; this deletes the worktree, the event log and the report. Branch `muster/NAME` stays in the repository, so `git log <baseSha>..<head sha>` still works. Read the report first. `clean` prints `removed <RUNDIR> base=<baseSha> head=<head>` (`head=unknown` when the run recorded none), so keep that line for the review.

```
bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts clean NAME
```

`clean` removes the run directory only when the worker is not running (`phase.json` says `exited`, or the recorded pid is gone, which `status` shows as `dead`) and the repository already holds everything in the clone: the commit `muster/NAME` points at in `<RUNDIR>/worktree` must be the commit, or an ancestor of the commit, that `muster/NAME` points at in the repository. `fetched` and `fetchError` in `phase.json` play no part. Otherwise it refuses, removes nothing and exits non-zero: no run directory for NAME, the worker still running (stop it and wait), `meta.json` unreadable, or the branch not fetched back. For the last, fetch the branch by hand with the command in Collect, then run `clean` again.

## Confinement

A worker does not get the main session's permissions.

- With `--unfenced` the worker is isolated by its own clone of the repository and nothing else, and Bash is not confined. Bash can read credential stores, reach any host, push with your credentials and write anywhere you can. Test suites that run `git init` work, and a repository or run directory under the temp directories is accepted. File tools are still path-fenced, the tool allowlist and the web fetch host allowlist below still apply.
- By default Bash runs inside Claude Code's OS sandbox. Writes are confined to the worker's worktree, the temp directory the sandbox sets as `TMPDIR`, the per-user temp directory that Apple `mktemp` writes to (`getconf DARWIN_USER_TEMP_DIR`), both kept writable for test fixtures, and `<RUNDIR>/cache`, where `npm_config_cache` and `BUN_INSTALL_CACHE_DIR` point so package installs work. Reads are not confined except for credential stores, which the sandbox denies: `~/.npmrc`, `~/.config/gh`, `~/.git-credentials`, `~/.config/git/credentials`, `~/.netrc`, `~/.aws`, `~/.docker/config.json`, `~/.ssh`, `~/.pi`, `~/.config/gcloud`, `~/.kube`, `~/.cargo/credentials.toml`, `~/.pypirc`, `~/Library/Keychains`. The list is best-effort: it does not follow symlink targets or env overrides such as `XDG_CONFIG_HOME`. A fenced `muster run` refuses a `--repo` or `MUSTER_HOME` under `/tmp`, `/private/tmp` or `$TMPDIR`, because the sandbox leaves those writable and a worker could then write the repository's refs or answer its own questions. The sandbox protects `.git/hooks` and `.git/config` under the worktree, so `git init` there fails with exit 128; a test suite that builds its fixture repositories under `mktemp -d` runs fenced. A suite that starts its own `sandbox-exec` cannot, because Seatbelt refuses a nested sandbox (exit 71); pi-dispatch's suite is one.
- The worker's tools are a fixed list (Read, Write, Edit, Bash, Glob, Grep, WebFetch, WebSearch, ToolSearch, TodoWrite, TaskCreate, TaskUpdate, TaskList), with claude.ai connectors off.
- File tools are fenced by path. A file request outside the worktree, or inside the worktree's `.git` or `.claude` directory, becomes a `question` for you.
- Web fetches, and Bash network access unless `--unfenced`, are limited to the default hosts: `registry.npmjs.org`. github.com is off the list because a worker can read your git credentials and would otherwise be able to push as you. Hosts listed in `MUSTER_ALLOW_HOSTS` are added to them, set in the environment of `muster run`:

```
MUSTER_ALLOW_HOSTS=pypi.org,files.pythonhosted.org bun ${CLAUDE_PLUGIN_ROOT}/src/muster.ts run --name NAME --model MODEL --repo /abs/path/to/repo --ticket "TICKET TEXT"
```

- A request for any other host, a web fetch outside the list, and every web search is refused without a `question`. A worker that cannot proceed ends the run `BLOCKED`, and its report names the host.
- The worker runs the model you named, in default permission mode, and loads no user or project settings.
