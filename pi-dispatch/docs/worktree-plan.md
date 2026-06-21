# pi-dispatch Worktree Isolation Plan

Design for parallel Pi runs in isolated git worktrees, MAIN-driven, with zero
changes to `pi-dispatch.sh`, `pi-poll.sh`, and `pi-stop.sh`.

---

## 1. Motivation

`pi-dispatch.sh` runs Pi in the background against whatever directory is the
**process cwd** at launch time. When multiple Pi tasks run in parallel against
the same working tree, their file edits collide. The fix is to give each
parallel task its own git worktree so each Pi run operates on a fully isolated
checkout — no shared working-tree contention.

---

## 2. Mechanism (E1, E2)

### 2.1 How Pi inherits cwd

`pi-dispatch.sh` does **not** `chdir` before launching Pi. The only `cd` in
the script is the `SCRIPT_DIR` subshell on line 1
(`SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`), which resolves
the script's own location and has no effect on Pi's working directory.

Pi itself (as of version 0.79.4) has **no `--cwd`, `--directory`, or
`--chdir` flag**. Process-cwd inheritance is therefore the only available
seam: Pi runs in whichever directory is the caller's cwd when `pi-dispatch.sh`
is executed.

### 2.2 Worktree isolation via caller-side cd (zero changes to dispatch scripts)

Worktree isolation is achieved entirely on the **caller side**. MAIN (or any
orchestrator) sets cwd to the target worktree before invoking dispatch:

```bash
# Inline subshell form
(cd "$WORKTREE_PATH" && pi-dispatch.sh "$BRIEF")

# Claude Code run_in_background form (cwd parameter)
run_in_background(cmd="pi-dispatch.sh '$BRIEF'", cwd="$WORKTREE_PATH")
```

Pi inherits that cwd and therefore operates only inside `$WORKTREE_PATH`.

**Zero changes to `pi-dispatch.sh`, `pi-poll.sh`, and `pi-stop.sh`.** All
three scripts remain frozen. The caller-convention pattern (cd into worktree,
then dispatch) is the entire mechanism.

A flag-based approach (e.g. a `--worktree` option for `pi-dispatch.sh`) was
evaluated and **rejected**: internalizing a chdir into the dispatch script
would add complexity, break the single-responsibility principle, and force
all callers to learn a new flag — all unnecessary when the process-cwd seam
already delivers the same isolation for free. The one-way door is: **pi-dispatch.sh stays frozen**
(see OWD-A in §6).

### 2.3 Stdout contract and setsid/pgid path — unchanged

The stdout contract emitted by `pi-dispatch.sh` at launch time remains exactly:

```
OUTPUT=<absolute path to result file>
PID=<background wrapper pid (== PGID)>
RUNDIR=<per-run dir holding result/stderr/pid/pgid/rc/start>
```

The perl `POSIX::setsid` wrapper, PGID-based process-group kill, and
`pi-stop.sh` group-kill path (`kill -$PGID`) are all **unchanged**. Worktrees
add no new process-management surface.

---

## 3. MAIN Owns the Full Worktree Lifecycle (E3)

Pi is **hands**: it edits files inside a worktree and produces a result. It
runs no git commands. MAIN (the orchestrating Claude Code instance or
`cf-pi-run.sh`) owns all five lifecycle phases:

| Phase | MAIN action | Git verb |
|-------|-------------|----------|
| **Create** | Check out a new worktree on a fresh branch | `git worktree add <path> -b <branch>` |
| **Run** | Dispatch Pi into the worktree via caller-side cd | `pi-dispatch.sh` |
| **Collect** | Read `result.md` / stream; record PASS or FAIL | `pi-poll.sh` |
| **Merge / Integrate** | Commit Pi's edits, merge or cherry-pick back to trunk | `git commit`, `git merge` / `git cherry-pick` |
| **Clean** | Remove the worktree and prune stale refs | `git worktree remove --force`, `git worktree prune` |

Pi performs **no git lifecycle operations** (no `git worktree`, no
`git branch`, no `git commit`). Every git touch is MAIN's responsibility.

---

## 4. Parallel Fan-Out (E4)

Parallel execution is N worktrees, one per concurrent task, all fired by MAIN.

```
MAIN
├── (cd .claude/worktrees/task-A && pi-dispatch.sh briefA) → PID_A
├── (cd .claude/worktrees/task-B && pi-dispatch.sh briefB) → PID_B
└── (cd .claude/worktrees/task-C && pi-dispatch.sh briefC) → PID_C
```

This is a **star topology**: only MAIN can fan out. Sub-agents spawned by
MAIN cannot spawn their own sub-agents (C2 constraint — empirically
established in the cc-multiagent constraints reference). Therefore all
worktree creation, dispatch, and collection must be driven from the MAIN
context, not delegated to intermediate agents.

---

## 5. One Branch Per Worktree — Independent Commits (E5)

Each worktree is checked out on a **distinct branch**. This means:

- Pi's file edits in worktree A land on branch `pi/task-A-<runid>`, Pi's
  edits in worktree B land on branch `pi/task-B-<runid>`, and so on.
- There is **no shared working-tree contention**: the same file path modified
  by two concurrent Pi runs occupies different inodes (two distinct worktree
  checkouts of two distinct branches).
- Each Pi run produces **independent commits** that can be reviewed and
  integrated individually.

**D1 (two-way, default): MAIN commits Pi's edits per worktree.**  
After `pi-poll.sh` reports success, MAIN runs `git add -A && git commit`
inside each worktree (or equivalently via `git -C <wt-path> commit`). Pi
does not commit. This keeps the commit author and message under MAIN's
control and simplifies audit.

One-worktree-one-branch is the **committed concurrency contract** (see OWD-B
in §6).

---

## 6. Working-Tree Isolation vs Artifact Isolation (E6)

These are two distinct, independent isolation axes:

**Working-tree isolation (cwd-isolated)**  
The git worktree checkout that Pi edits. Each concurrent task has its own
checkout path (`.claude/worktrees/<id>`). Pi's file writes are bounded to
this directory.

**Run artifact isolation (RUN_ID-isolated, outside the worktree)**  
`pi-dispatch.sh` stores all run artifacts — `result.md`, `pi.stream.jsonl`,
`pi.stderr.log`, `pi.pid`, `pi.pgid`, `rc`, `pi-start.ts`, and the session
directory — under:

```
OUTDIR/run-$RUN_ID/
```

where `OUTDIR` defaults to `${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/pi-dispatch`
(D3). Each run already gets its own `RUN_ID`-namespaced subdirectory. These
artifacts live **outside the worktree** and do **not** need to be moved into
it. The two isolation mechanisms are orthogonal; they do not interfere.

---

## 7. Cleanup and Safety (E7)

### 7.1 Normal cleanup

After MAIN collects the result and integrates the branch, it tears down the
worktree:

```bash
git worktree remove --force .claude/worktrees/<id>
git worktree prune
```

`--force` is required because Pi may have left untracked files. `prune`
removes any stale administrative refs that `remove` leaves behind. Run
`prune` after each batch (or lazily at startup) to avoid accumulating stale
refs.

### 7.2 Failed-run disposition

When `pi-poll.sh` reports FAIL, MAIN still tears down the worktree with
`git worktree remove --force` + `git worktree prune`. Pi's partial edits are
discarded with the worktree. The RUNDIR (under `$HOME/.cache/pi-runs`)
survives intact for post-mortem diagnosis — `pi.stderr.log` and
`pi.stream.jsonl` remain accessible.

### 7.3 Group-killed runs (pi-stop.sh)

`pi-stop.sh` group-kills `-$PGID`, terminating Pi and every descendant
process. The worktree is left on disk (the perl wrapper dies before writing
the `rc` file — absent `rc` on a dead process is the truncated/killed FAIL
signal). MAIN detects the absent `rc` via `pi-poll.sh`, marks the run FAIL,
and then calls `git worktree remove --force` + `git worktree prune` on the
orphaned worktree.

### 7.4 Unmerged-branch guard

MAIN must **not silently remove a worktree whose branch has not yet been
merged** (or whose output has not been collected). Before calling
`git worktree remove --force` on a branch that was expected to produce a
result, MAIN verifies that the branch content has been integrated (or
explicitly discarded). If the branch is unmerged and the run did not fail,
MAIN should warn and defer removal rather than silently destroying work.

---

## 8. Deterministic, Collision-Free Naming (E8)

### 8.1 Worktree paths (D2)

```
<repo-root>/.claude/worktrees/<task-id>
```

Example: `.claude/worktrees/shard-42` or `.claude/worktrees/build-2026-06-22`.

`.claude/` is already the conventional per-repo Claude workspace directory;
placing worktrees there keeps them separate from source directories. Each
`<task-id>` is unique within a batch, so paths never collide.

### 8.2 Branch names (D4)

```
pi/<task-id>-<runid>
```

Example: `pi/shard-42-20260622-143201-8831`.

`<task-id>` is the logical task identifier; `<runid>` is the `RUN_ID` stamp
used by `pi-dispatch.sh` (`date +%Y%m%d-%H%M%S-$$`). The combination is
globally unique (same host, different second or different pid). Branches are
created from HEAD of the current trunk branch (D4 default).

---

## 9. Decisions Classified by Reversal Cost (E9)

### Two-way doors (reversible defaults; the loop can correct later)

| ID | Default chosen | Notes |
|----|----------------|-------|
| **D1** | MAIN commits Pi's edits per worktree | Keeps commit authorship + message under MAIN control; Pi never commits |
| **D2** | Worktree path: `.claude/worktrees/<task-id>` | Consistent with Claude workspace conventions; easy to relocate |
| **D3** | Global OUTDIR: `$HOME/.cache/pi-runs` (existing default) | Artifacts stay in the persistent cache; no change to dispatch script |
| **D4** | Branch off HEAD of current trunk; name `pi/<task-id>-<runid>` | Simple and auditable; rebase strategy is a later choice |
| **D5** | MVP: collect result + report; do NOT auto-merge | Auto-merge is a follow-on; MVP keeps integration under human/MAIN review |

### One-way doors (already decided; cost to reverse is architectural)

**OWD-A — Keep `pi-dispatch.sh` frozen (caller-convention).**  
The chosen design is caller-side `cd` into the worktree before invoking
dispatch. This is the open door: any caller can use any worktree by simply
setting cwd. A flag-based approach (e.g. a `--worktree` option) was evaluated
and **rejected**: internalizing a chdir into the dispatch script would couple
it to git, burden every caller with a new flag, and break the
single-responsibility boundary — all unnecessary when the process-cwd seam
already delivers full isolation for free. The door this decision closes is a
`--worktree` flag becoming part of `pi-dispatch.sh`'s interface. The
`OUTPUT=` / `PID=` / `RUNDIR=` stdout contract and the `setsid`/pgid
process-group path are unchanged.

**OWD-B — One worktree, one branch is the committed concurrency contract.**  
Parallel Pi tasks sharing a branch (and thus a working tree) is ruled out.
The branch-per-worktree guarantee is what makes independent commits safe and
auditable. Later turns build merge/rebase strategies on top of this
assumption; relaxing it would invalidate those designs.

---

## 10. Scope (E10)

### In scope

- **MAIN-driven parallel dispatch**: the core target. MAIN fans out N Pi runs
  into N worktrees simultaneously.
- **context-flow shard fan-out (`cf-pi-run.sh`)**: the natural consumer of
  this mechanism. `cf-pi-run.sh` dispatches Pi shards from within the MAIN
  context-flow execution; adopting the caller-side `cd` + worktree pattern
  there unlocks parallel shard execution with no write collisions.

### Out of scope

- **`spiral/scripts/pi-build.sh`**: explicitly out of scope. `pi-build.sh`
  dispatches a single, short, blocking Pi build task — one call, no fan-out,
  sequential by design. It does not need worktree isolation. This plan does
  not change `pi-build.sh`.
