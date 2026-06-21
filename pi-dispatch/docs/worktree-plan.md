# pi-dispatch Worktree Plan: Hoisting cf's Proven Lifecycle into a Reusable Primitive

**Direction:** Sink the worktree lifecycle that context-flow already ships and has
validated into a pi-dispatch-level shared primitive. This is NOT greenfield — it is
a hoist and generalize of existing cf logic.

---

## EX-1 — Retraction of the False cwd-Passthrough Claim

**RETRACTED / WRONG — superseded by the ground truth below.**

The previous version of this document claimed that pure cwd-passthrough equals
isolation with zero script changes. That claim is false and is no longer the
active design.

**Ground truth:** The working directory (cwd) does NOT sandbox or confine
absolute-path writes. Pi has shell and edit tools — it can write to any absolute
path it is instructed to target, regardless of the process cwd at launch time.
Changing cwd before calling pi-dispatch.sh does NOT prevent Pi from writing
outside that directory if the brief points it elsewhere. Isolation therefore
cannot rely on cwd alone.

The correct isolation seam — already proven in context-flow — is documented in
EX-2 below.

---

## EX-2 — Real Isolation Seam: How cf Actually Confines Pi Writes

context-flow enforces three mutually reinforcing mechanisms. Each is grounded in a
real script line.

**Mechanism 1 — Brief-injected absolute WORK_DIR path (cf-pi-brief.sh:150)**

The brief tells Pi exactly where to write via an explicit absolute path variable:

```
- **WORK_DIR**: `$WORK`     (you are already on the cf branch here)
```

Pi is told its workspace is that absolute path. It does not discover its workspace
from cwd inference.

**Mechanism 2 — Never-cd-out rule, enforced by the brief (cf-pi-brief.sh:159)**

The brief's Rules section states:

```
- All file writes MUST stay inside WORK_DIR. Never `cd` out, never edit files
  in the parent repo checkout.
```

The "never cd out" constraint is injected into every Pi invocation as an
instruction, not a kernel-enforced sandbox.

**Mechanism 3 — All git verbs issued via `git -C <path>` from MAIN (cf-pi-worktree.sh / cf-pi-integrate.sh)**

Pi runs NO git commands. Every git operation — worktree creation, diff capture,
worktree removal, integration merges — is issued from the MAIN side using
`git -C <repo|work>`. Pi's cwd is irrelevant to git operations; the
`-C` flag pins the working tree explicitly.

Together: brief abs-path + never-cd-out rule + outer git -C form the actual
isolation boundary.

---

## EX-3 — Write-Location Pin: Where Pi Writes When Brief and cwd Differ

### Write-Pin Test (inline reproducible sketch)

This scenario pins the observable behavior of Pi when cwd is one worktree (WT-A)
but the brief names an absolute path in a different worktree (WT-B).

```bash
# Setup
REPO=$(mktemp -d) && git -C "$REPO" init -q && git -C "$REPO" commit --allow-empty -m init

# Create two worktrees
WTA="$REPO/wt-a" && WTB="$REPO/wt-b"
git -C "$REPO" worktree add -b branch-a "$WTA" HEAD
git -C "$REPO" worktree add -b branch-b "$WTB" HEAD

# Write a brief that names an absolute path inside WT-B (different worktree)
BRIEF=$(mktemp) && cat > "$BRIEF" <<EOF
Write the string "hello" to the file $WTB/output.txt
EOF

# Dispatch Pi with cwd set to WT-A
(cd "$WTA" && pi-dispatch.sh "$BRIEF")

# Poll until complete, then assert:
# Expected observable: output.txt lands at the brief's ABSOLUTE path ($WTB/output.txt),
# NOT at $WTA/output.txt (the cwd worktree).
#   assert: [ -f "$WTB/output.txt" ]
#   assert: [ ! -f "$WTA/output.txt" ]   # NOT at cwd
```

**Expected observable:** The edit lands at the brief's absolute path (`$WTB/output.txt`),
NOT at the cwd worktree (`$WTA/`). This confirms that cwd does not confine writes and
that the brief's absolute path is the true write target.

---

## EX-4 — Prior Art: What Already Exists in context-flow

### Prior Art / What Already Exists

The five worktree lifecycle phases are fully implemented in context-flow today.
The goal of this plan is to generalize and hoist that proven logic into a
pi-dispatch-level reusable primitive — not to build from scratch.

| Phase  | What it does                                    | Real script in cf                          |
|--------|-------------------------------------------------|--------------------------------------------|
| create | Allocate a git worktree + fresh branch          | `cf-pi-worktree.sh`                        |
| run    | Background-dispatch Pi into the worktree        | `cf-pi-dispatch.sh` (delegates to canonical `pi-dispatch.sh`) |
| collect| Poll until Pi finishes; read result             | `cf-pi-poll.sh`                            |
| merge  | Commit Pi's edits; merge shard branches         | `cf-pi-integrate.sh`                       |
| clean  | Capture diff + remove worktree                  | `cf-pi-worktree.sh` (cleanup append) + `cf-pi-stop.sh` |

**Intent:** Extract and reuse the logic these scripts encode. The pi-dispatch layer
will generalize cf's proven implementation into primitives any consumer can call
without re-implementing the lifecycle from scratch.

---

## EX-5 — Interface Boundary: What Hoists vs What Stays in cf

### Hoisted to pi-dispatch (reusable primitives)

These components become the shared layer any consumer can call:

| Script / component       | What it provides                                              |
|--------------------------|---------------------------------------------------------------|
| `pi-dispatch.sh`         | Frozen. Launch Pi in background; emits `OUTPUT=`/`PID=`/`RUNDIR=`. |
| `pi-poll.sh`             | Frozen. Poll a RUNDIR for completion status.                  |
| `pi-stop.sh`             | Frozen. Group-kill primitive: SIGTERM then SIGKILL on process group (`kill -$PGID`). |
| worktree create/clean    | Generalized shell helpers wrapping `git worktree add/remove`. |

`pi-stop.sh` group-kill is the foundational cleanup primitive — all consumers
share it. It must remain on the hoisted side.

### Stays in cf (consumer-specific)

| Script / component          | Why it stays in cf                                            |
|-----------------------------|---------------------------------------------------------------|
| `cf-pi-integrate.sh`        | Contract attribution logic — maps test failures back to contracts; this is cf-specific domain knowledge. |
| `cf-pi-shard.sh`            | cf sharding schema; not generic.                              |
| `cf-pi-brief.sh`            | cf-specific brief assembly (contracts.json + shards.json).    |
| Integration branch strategy | cf's `ctxflow/<flow>/integrated` merge orchestration.         |

The contract attribution in `cf-pi-integrate.sh` is the clearest example: it
parses test output and traces failures to named contracts — a cf-only concern that
does not belong in a generic primitive.

---

## EX-6 — Unified Naming Convention

One naming convention, derived from cf's proven scheme.

**Worktree path:**

```
$session/work
```

`WORK` is always `$session/work` (from `cf-pi-env.sh:58`). The session directory
is the caller-rooted per-run dir, typically under `/tmp` (not `/tmp` hardcoded
in the primitive, but the caller controls the session root). `$session/work` is
the canonical worktree location for any consumer that follows the session-dir
convention.

**Branch names:**

```
ctxflow/$SESSION_BASENAME        ← per-shard working branch (cf-pi-env.sh:59)
ctxflow/<flow>/integrated        ← integration branch (cf-pi-integrate.sh:71)
```

The `ctxflow/` prefix unifies all branches under a single inspectable namespace.
`ctxflow/$SESSION_BASENAME` is the per-shard branch. `ctxflow/<flow>/integrated`
is the branch where all PASS shard branches are merged before the final gate run.

**What we do NOT use:** `.claude/worktrees/<task-id>` and `pi/<task-id>-<runid>`
were proposed in the old version of this document. Those conventions are abandoned
in favor of the cf-proven scheme above.

---

## EX-7 — Cleanup Order: kill-confirm BEFORE worktree remove

The cleanup sequence is non-negotiable. A live Pi process group can hold file
handles inside `$WORK`, creating an `index.lock` or holding `.git/worktrees/<id>`
administrative state. Removing the worktree while a live descendant still holds
`$WORK` produces race conditions.

**Correct sequence:**

1. **Group-kill** via `pi-stop.sh` — sends SIGTERM then SIGKILL to process group
   (`kill -$PGID`). This terminates Pi and every descendant spawned under it.

2. **Confirm-dead poll** — after issuing the kill, poll until the process group is
   gone. The pgid is sourced from `$rundir/pi.pgid` (written by pi-dispatch.sh at
   lines :124/:235 into the `RUNDIR=` path returned on stdout at :119). At clean
   time, `$rundir` is read back from the caller-persisted path — see the H-A binding
   mechanism documented in EX-12 below. The full clean-time poll reads:

   ```bash
   # At clean time: read rundir from the caller-persisted file (cf-pi-dispatch.sh:87 pattern)
   rundir="$(cat "$session/pi-rundir")"
   pgid="$(cat "$rundir/pi.pgid")"
   until ! kill -0 "$pgid" 2>/dev/null; do sleep 0.2; done
   ```

   This poll ensures the process group is fully dead before proceeding.

3. **`git worktree remove --force`** — only after the confirm-dead poll returns.

**Race rationale:** A live descendant can hold an `index.lock` inside `$WORK` or
an administrative file under `.git/worktrees/<id>`. Removing the worktree with a
live descendant holding `$WORK` produces unpredictable behavior — the kernel may
block the remove or leave stale refs.

**This confirm poll is net-new hardening, not present in cf today.** Today,
`cf-pi-stop.sh` (the thin adapter) falls back to only `sleep 2` before issuing
the final `kill -9` — it does not poll for confirmed group death.

**RETRACTED / WRONG — the following prior-art claim was false and is no longer asserted:**
~~The sequence in `cf-pi-run.sh:236` (the `fail_kill` / abort-then-cleanup ordering)
already models the correct intent: call `cf-pi-stop.sh --abort` first, then proceed
with cleanup.~~

**Ground truth:** `fail_kill` in `cf-pi-run.sh` (around line 236) calls only
`cf-pi-stop.sh --abort` then exits. There is no `worktree remove` and no
confirm-poll in `fail_kill`. The `git worktree remove --force "$WORK"` executes
inside the appended `cleanup.sh` (CLEANUP_SCRIPT, cf-pi-worktree.sh:81), which the
orchestrator runs separately, time-decoupled from `fail_kill`. cf currently has no
confirm-poll at that cleanup remove site. The hoisted primitive adds an active
poll loop (reading pgid from `$rundir/pi.pgid`) immediately before that
`worktree remove` call, making worktree removal race-free.

---

## EX-8 — Worktree Remove Safety: Commit-or-Discard, Not Defer-if-Unmerged

**How removal actually works** (from `cf-pi-worktree.sh:13`):

> "The cf branch is intentionally NOT deleted — it carries the per-contract commit
> history the user keeps."

Removing a worktree does NOT lose commits. Commits live on the branch, and the
branch is kept. After `git worktree remove --force`, the branch and all its commits
remain accessible. No commit history is lost by worktree removal.

**What CAN be lost:** Uncommitted edits. Any changes inside `$WORK` that were not
committed to the branch are gone when the worktree is removed. This is the only
real loss risk.

**The guard:** Before calling `git worktree remove --force`, check for uncommitted
changes:

```bash
git -C "$WORK" status --porcelain
```

If the output is non-empty, there are uncommitted edits. The caller must either
commit them (to preserve them on the branch) or explicitly discard them. The cf
cleanup script in `cf-pi-worktree.sh:73-82` captures a diff before removal for
this reason — the diff is the escape hatch if uncommitted work needs post-hoc
review.

**What the guard is NOT:** "Warn and defer removal if the branch is unmerged." That
old rule is wrong (and no longer asserted). The branch being unmerged is not a
dangerous state — the branch persists after worktree removal. The only dangerous
state is uncommitted local edits, which the `status --porcelain` check catches.

---

## EX-9 — Decisions by Reversal Cost

### Two-way doors (reversible defaults)

The following are two-way doors: they can be changed without breaking other
consumers or invalidating already-committed designs.

| ID    | Default chosen               | Notes                                                        |
|-------|------------------------------|--------------------------------------------------------------|
| TW-1  | Worktree path: `$session/work` | Caller controls session root; easily relocated per consumer. |
| TW-2  | Branch prefix: `ctxflow/`    | Unifies cf and hoisted-primitive branches in one namespace.  |
| TW-3  | Commit authorship: MAIN commits Pi's edits | Keeps author/message under orchestrator control; Pi never commits. |

**OWD-A — `pi-dispatch.sh` stays frozen (one-way door, already decided).**

`pi-dispatch.sh` is the frozen canonical dispatcher. Its `OUTPUT=` / `PID=` /
`RUNDIR=` stdout contract and the `setsid`/pgid process-group path are untouched.
The worktree hoist adds NO changes to `pi-dispatch.sh`. The mechanism for
directing Pi to a worktree is entirely caller-side: the brief injects the absolute
`WORK_DIR` path, and the `never cd out` rule binds Pi to it. No `--worktree` flag
or any other modification to `pi-dispatch.sh` is proposed or accepted.

This is a re-statement of a closed door, not a reopening. All turns that follow
build atop the frozen dispatch interface.

**OWD-B — One worktree, one branch (one-way door, already decided).**

One-worktree-one-branch is the concurrency contract. Parallel Pi tasks each get an
independent worktree on an independent branch. This makes commits auditable and
physically separates write surfaces. Later turns build merge/rebase strategies on
this assumption; relaxing it would invalidate those designs.

---

## EX-10 — Script Inventory and Self-Consistency Check

All `cf-pi-*.sh` and `pi-*.sh` basenames referenced in this document are verified
to exist on disk under `context-flow/scripts/` or `pi-dispatch/scripts/`.

**context-flow/scripts/ (all referenced):**
- `cf-pi-brief.sh` — brief assembly; sources isolation rules at line 150 and 159
- `cf-pi-dispatch.sh` — thin adapter; delegates to canonical `pi-dispatch.sh`
- `cf-pi-env.sh` — session env library; defines `WORK=$session/work` (line 58) and `CF_BRANCH=ctxflow/$SESSION_BASENAME` (line 59)
- `cf-pi-integrate.sh` — integration gate; creates `ctxflow/<flow>/integrated` (line 71)
- `cf-pi-poll.sh` — thin adapter; polls canonical pi-poll.sh
- `cf-pi-run.sh` — full shard lifecycle; `fail_kill` abort-then-cleanup at line 236
- `cf-pi-shard.sh` — sharding schema
- `cf-pi-stop.sh` — thin adapter; delegates to canonical `pi-stop.sh`
- `cf-pi-worktree.sh` — worktree create/clean; branch intentionally kept (line 13); cleanup block lines 73-82

**pi-dispatch/scripts/ (all referenced):**
- `pi-dispatch.sh` — canonical launcher; frozen
- `pi-poll.sh` — canonical poller; frozen
- `pi-stop.sh` — canonical group-kill primitive; frozen

**No retired translation-layer vocabulary** (DONE/ALIVE/ERROR/STALL/NO_OUTPUT/NO_JSONL/RC_FAIL
as a STATUS→token case table) appears in this document as a live mechanism. That
layer was retired at commit b4dda64.

**Internal cross-references:** Every EX-N reference in this document (EX-1 through
EX-15) corresponds to a section defined here. Completeness holes for turns beyond
turn-3 are documented as named subsections within EX-11/EX-12 rather than as
separate EX-N headings, to avoid introducing forward-dangling references. No
dangling EX-N references exist in this document.

---

## EX-11 — Parameterized Interface Contract: Named Params Replace cf-env Vars

### Why a param table matters

`cf-pi-worktree.sh` sources its inputs from `load_cf_pi_env` — a cf-specific
environment loader. The hoisted helper `pi-worktree.sh` must run without that
loader; all inputs become explicit, named primitive parameters.

### cf-env var → named parameter mapping

| cf-env variable    | cf script citation              | Named parameter in pi-worktree.sh | Notes                              |
|--------------------|---------------------------------|-----------------------------------|------------------------------------|
| `REPO_ROOT`        | cf-pi-worktree.sh:41, :81, :91 | `repo_root`                       | derived-in-cf → becomes caller-supplied (see below) |
| `CF_BRANCH`        | cf-pi-worktree.sh:63            | `branch_name`                     |                                    |
| `BASE_HEAD`        | cf-pi-worktree.sh:71            | `base_ref`                        | derived-in-cf → becomes caller-supplied (see below) |
| `BASE_BRANCH`      | cf-pi-worktree.sh:72, :77      | `base_branch`                     | derived-in-cf → becomes caller-supplied (see below) |
| `WORK`             | cf-pi-env.sh:58                 | `work_path`                       |                                    |
| `DIFF_FILE`        | cf-pi-env.sh:58 / worktree:80  | `diff_out`                        |                                    |
| `CLEANUP_SCRIPT`   | cf-pi-worktree.sh:73            | `cleanup_out`                     |                                    |
| `RUNDIR` (from pi-dispatch stdout) | pi-dispatch.sh:119; pi.pgid written :124/:235 | `rundir` | caller passes the RUNDIR= value; pgid read as `$rundir/pi.pgid` |

With these named parameters the helper has no dependency on `load_cf_pi_env` or any
cf session convention. Any consumer (spiral, or a future plugin) can call
`pi-worktree.sh` by passing plain strings.

### Create-time derivation inversion

In `cf-pi-worktree.sh`, three values are **derived at create time** from the
current shell's context:

- **`REPO_ROOT`** — `git rev-parse --show-toplevel` (cf-pi-worktree.sh:41)
- **`BASE_BRANCH`** — `git symbolic-ref --quiet --short HEAD` (cf-pi-worktree.sh:46)
- **`BASE_HEAD`** — `git rev-parse HEAD` (cf-pi-worktree.sh:47)

These are safe to derive inside cf because cf guarantees its scripts are always
invoked from within the repository root. In the hoisted primitive this guarantee
does not hold — a consumer could call `pi-worktree.sh` from any working directory.

**Inversion:** All three values are promoted from derived-in-cf to caller-supplied
parameters. The primitive does NOT re-derive them from the calling environment;
it accepts them as explicit inputs.

**Failure mode avoided:** A consumer calling from outside the repo root would
resolve a wrong toplevel — `git rev-parse --show-toplevel` walks up the filesystem
tree from the current working directory, so if the caller's cwd is `/tmp/work` (or
any path outside the repository), the call either errors or returns a wrong
toplevel, causing the wrong git tree to be used for all subsequent worktree
operations. Making `repo_root` caller-supplied closes this failure mode entirely.

### H-B: env.sh write-back — decision: DROP

`cf-pi-worktree.sh:89-94` writes `REPO_ROOT`, `BASE_BRANCH`, and `BASE_HEAD` back
into `$session/env.sh` after the worktree is created. This write-back allows the
idempotency check (lines :29-39) and the re-source in `cf-pi-run.sh:180-182` to
recover those values from a persistent file if the session is resumed.

**Decision: DROP.** The create-time derivation inversion described above already
promotes all three values (`repo_root`, `base_branch`, `base_ref`) to
caller-supplied parameters — the caller provides them explicitly at every invocation.
There is nothing to write back: the primitive derives nothing at create time that the
caller does not already hold. The write-back to `$session/env.sh` is therefore
eliminated. Callers that need to persist these values for later steps do so in their
own session state, not via an implicit side-effect on `env.sh`.

### Preconditions before worktree create

`cf-pi-worktree.sh:49-61` checks git identity before creating the worktree. If
neither a repo-level nor a global `user.email` is configured, the script prints a
diagnostic and exits with **exit 2** (hard-fail):

```
cf-pi-worktree: git user.email is not configured.
Per-contract commits in $WORK will fail. ...
```

This guard exists because per-contract commits issued from `$WORK` later in the
lifecycle would fail mid-flow with a cryptic "Please tell me who you are" error —
far harder to diagnose than an upfront precondition check.

**Decision (DEC-1):** Keep hard-fail unconditionally. The hoisted primitive retains
the exit 2 hard-fail with no opt-out mechanism. Failing early with a clear message
is strictly better than failing silently mid-lifecycle. A commit-mode opt-out param
is not adopted: callers that genuinely do not commit anything do not trigger the
git-identity path, so the guard is inert for them.

### git-vs-scratch dual-mode selection

`cf-pi-worktree.sh:83-86` implements a dual-mode path:

- **git-branch mode** (lines 63-82): when `$REPO_ROOT` is non-empty (the caller is
  inside a git repository), the script runs `git worktree add -B $CF_BRANCH $WORK HEAD`
  and appends a cleanup block (diff capture + `worktree remove --force`).
- **scratch mode** (lines 83-86): when `$REPO_ROOT` is empty (non-git directory),
  the script falls back to `mkdir -p "$WORK"` and appends only a comment to the
  cleanup script — no worktree registration, no cleanup, `$WORK` is retained for
  inspection.

**Mode selection:** The presence of `$REPO_ROOT` (derived from `git rev-parse
--show-toplevel`) selects the mode. A non-empty `$REPO_ROOT` → git-branch mode.
Empty → scratch mode.

**Decision (DEC-3):** The hoisted primitive **requires git** — callers in a non-git
directory receive a hard error. Scratch mode (`mkdir -p`, no cleanup, dir retained)
is documented as an explicit opt-in future extension, not the current default.
Rationale: the value proposition of the hoisted primitive is the full git lifecycle
(isolated branch, clean diff, safe removal). Silently falling back to scratch mode
would mask configuration errors and deprive callers of the lifecycle guarantees they
expect. Scratch mode is a distinct use-case that warrants its own flag if ever
adopted, not a transparent fallback.

### H-C: Idempotent re-entry — decision: RETAIN

`cf-pi-worktree.sh:24-39` implements an idempotency guard: if the worktree path
`$WORK` is already a live worktree when `create` is called again, the script echoes
a notice and exits 0 without re-running the create steps.

The liveness check is **on-disk**, using:

```bash
git -C "$WORK" rev-parse --is-inside-work-tree 2>/dev/null
```

This probes git's own view of whether the directory is an active worktree on disk.
It is intentionally **not** an env-grep (searching `$session/env.sh` or similar for
a recorded variable). An env-grep would produce a shard-seed false-positive: if
`env.sh` was written by a prior run (or seeded from another shard), a grep might
indicate "already created" even when no on-disk worktree actually exists at `$WORK`.
The on-disk check avoids this false-positive entirely — the directory either passes
`rev-parse --is-inside-work-tree` or it does not, regardless of any env.sh contents.

**Decision: RETAIN.** The hoisted primitive keeps the idempotent re-entry behavior.
Callers that call `create` on an already-live worktree get a clean exit 0, not an
error. This is safe and useful: in retry/resume scenarios the caller should not have
to track whether `create` already ran.

### merge-base diff-base policy: generic-with-param

The diff capture in `cf-pi-worktree.sh:64-80` uses `merge-base HEAD $BASE_BRANCH`
(with fallback to `$BASE_HEAD` when the branch is unavailable). This policy is
classified as **generic-with-param** (default TW-5): it is correct for the
advancing-base case — *diff from the merge-base of the working branch and the
integration branch, so that only the consumer's own commits appear in the diff
regardless of whether the base has advanced since the worktree was created*. That
rationale is general value that belongs in the hoisted primitive. Single-branch
consumers that do not supply `base_branch` use the base_ref fallback
(HEAD by default), which is safe for their read-your-own-commits use-case.

---

## EX-12 — Retraction of False kill-confirm Prior-Art; Real Remove Site Located

### Where `git worktree remove` actually executes

**RETRACTED — the prior claim that `cf-pi-run.sh:236` already models
confirm-then-remove is wrong and is no longer asserted.**

The real remove site is the **appended `cleanup.sh`** (CLEANUP_SCRIPT). In
`cf-pi-worktree.sh:73-82`, the create path appends a shell block to `$CLEANUP_SCRIPT`.
That block contains:

```bash
git -C "$WORK" diff "$_diff_base" > "$DIFF_FILE" 2>/dev/null || true
git -C "$REPO_ROOT" worktree remove --force "$WORK" 2>/dev/null || true
```

The orchestrator runs this cleanup.sh separately, after the Pi session ends. The
`git worktree remove --force "$WORK"` call (cf-pi-worktree.sh:81) is
**time-decoupled from `fail_kill`**. The `fail_kill` function in `cf-pi-run.sh`
(around line 236) calls only `cf-pi-stop.sh --abort` then exits — there is no
`worktree remove` and no `kill -0` confirm-poll inside `fail_kill`.

### H-A: The ordering problem — why a bare `$rundir` inside the cleanup heredoc is unbound

The cleanup block is authored as a heredoc appended to `$CLEANUP_SCRIPT` at create
time (cf-pi-worktree.sh:73-82). The orchestrator later executes it via
`bash "$CLEANUP_SCRIPT"` (cf.md:601) in a **fresh bash shell that sources only
`env.sh`** — no ambient variables from the dispatch session are present.

Meanwhile, `RUNDIR` (the path produced by pi-dispatch.sh on stdout) only exists
**after** dispatch runs. The lifecycle order in `cf-pi-run.sh` is: create runs first
(lines :16-20, :178) and dispatch runs later (:227). The heredoc is written during
create — at that point, `RUNDIR` does not yet exist. At cleanup execution time,
`RUNDIR` is not in scope either, because the fresh bash has only `env.sh`. A bare
`$rundir` variable inside the heredoc body would therefore be **unbound at run time**,
producing an empty or erroneous path.

### H-A: Binding mechanism — option (a) caller-persisted path

The fix mirrors the pattern cf already uses for its stop adapter: `cf-pi-dispatch.sh`
writes the rundir into a well-known persisted file at `$session/pi-rundir`
(cf-pi-dispatch.sh:87), and `cf-pi-stop.sh` reads it back at stop time
(cf-pi-stop.sh:27) to obtain `$RUNDIR` before delegating to canonical `pi-stop.sh`
(:30-31).

The hoisted primitive applies the **same caller-persisted path mechanism** (option a):
after dispatch, the caller writes the `RUNDIR=` value into `$session/pi-rundir`
(mirroring cf-pi-dispatch.sh:87). The cleanup script reads it back at run time to
obtain the live `rundir` value. This eliminates the unbound-variable problem without
requiring any change to the frozen trio.

### Net-new hardening: confirm-poll before cleanup remove

cf currently has no confirm-poll at the cleanup remove site. The hoisted primitive
adds net-new hardening: a confirm-poll placed **immediately before** the `worktree
remove` call inside the cleanup block. At clean time, `rundir` is obtained from the
caller-persisted file (written at dispatch time, mirroring cf-pi-dispatch.sh:87;
read back here mirroring cf-pi-stop.sh:27). The pgid is then read from
`$rundir/pi.pgid` (the path written by pi-dispatch.sh at :124/:235):

```bash
# confirm-poll — placed immediately before worktree remove
# rundir is bound at run time by reading the caller-persisted path
rundir="$(cat "$session/pi-rundir")"
pgid="$(cat "$rundir/pi.pgid")"
until ! kill -0 "$pgid" 2>/dev/null; do sleep 0.2; done
git worktree remove --force "$work_path"
```

The `rundir="$(cat "$session/pi-rundir")"` line is what binds `$rundir` at clean
time — without it (or the equivalent caller-persisted mechanism), the variable is
unbound in the fresh bash context.

This makes worktree removal race-free by ensuring the process group is fully dead
before the remove runs. cf currently has no such poll at the cleanup.sh remove site —
this is a net-new addition in the hoisted primitive, not a reimplementation of
existing cf behavior.

---

## EX-13 — Named Net-New Helper; Frozen Trio Stays Byte-Unchanged

### New file: `pi-dispatch/scripts/pi-worktree.sh` (net-new)

The hoisted worktree lifecycle lives in a single net-new file:

```
pi-dispatch/scripts/pi-worktree.sh    ← NET-NEW; does not exist yet on disk
```

This file will implement the `create` and `clean` lifecycle phases (parameterized
per EX-11). It is not a rename or move of any existing file.

### Frozen trio: byte-unchanged (OWD-A, migration-plan.md:95)

The three canonical dispatchers in `pi-dispatch/scripts/` stay **byte-unchanged**
(untouched) by this work:

| Script            | Status   | Reason                                                        |
|-------------------|----------|---------------------------------------------------------------|
| `pi-dispatch.sh`  | frozen   | Canonical launcher; OUTPUT=/PID=/RUNDIR= contract is closed.  |
| `pi-poll.sh`      | frozen   | Canonical poller; no worktree awareness needed.               |
| `pi-stop.sh`      | frozen   | Canonical group-kill; used as-is by the cleanup sequence.     |

No `--worktree` flag, no new parameters, no modifications of any kind are proposed
for these three files. The worktree create/clean logic lives entirely in the new
`pi-worktree.sh` helper, leaving the frozen trio byte-unchanged.

---

## EX-14 — Per-Consumer Branch Namespace; Exact-Path Prune/Remove Disambiguation

### Per-consumer prefix parameter

Each consumer supplies a branch prefix parameter (default: `<consumer>/<session>`).
The hoisted primitive does not hard-code a prefix — the caller provides it:

```bash
pi-worktree.sh create \
  --repo_root "$REPO_ROOT" \
  --branch_name "${prefix}/${session_basename}" \
  --work_path "$session/work" \
  ...
```

**Namespace reservation:** `ctxflow/` is reserved for cf-only use. A spiral consumer
must not use `ctxflow/...` — it would collide with cf's branch namespace. Spiral
would pass its own prefix (e.g. `spiral/<session>`). The consumer/ prefix
convention ensures per-consumer namespaces remain inspectable and non-overlapping.

### Prune and remove: by exact `$work_path`, not prefix scan

When removing or pruning worktrees the primitive disambiguates by **exact
`$work_path`**, not by branch prefix scan. This mirrors cf's real implementation:

- **Existence check (cf-pi-integrate.sh:78):** `git worktree list --porcelain | grep -Fq "worktree $path"` — matches the exact registered path via porcelain output.
- **Remove (cf-pi-worktree.sh:81):** `git worktree remove --force "$WORK"` — removes by the exact `$work_path`.

This is not a prefix scan. No worktree is removed based on branch name pattern
matching. The exact `$work_path` is the single key for all prune and remove
operations, ensuring that removing one consumer's worktree cannot accidentally
affect another consumer's worktrees that happen to share a branch prefix.

---

## EX-15 — No-Regression: Turn-2 Corrected Content (EX-1..EX-10) Preserved

This section is an invariant: EX-11..EX-14 only add or refine; they do not retract
any turn-2 correction.

**EX-1 stance (cwd does NOT sandbox/confine):** The working directory does not
sandbox or confine absolute-path writes. Pi has shell and edit tools — it can write
to any absolute path the brief names, regardless of cwd. This stance is not reverted.

**EX-8 stance (commit-or-discard, not defer-if-unmerged):** No commits are lost by
worktree removal; the branch is kept. The only dangerous state is uncommitted local
edits. Defer-if-unmerged is a rejected anti-pattern and is not reasserted anywhere
in this document.

**EX-9 stances (OWD-A + OWD-B):** `pi-dispatch.sh` stays frozen and byte-unchanged
(OWD-A). One-worktree-one-branch is the concurrency contract (OWD-B). Neither
one-way door is reopened by EX-11..EX-14.

**EX-10 retired translation-layer note:** The legacy STATUS→token case-table
(see EX-10 above for the vocabulary) was retired at commit b4dda64. It does not
appear as a live mechanism in this document. The `cf-pi-poll.sh` basename is still
live (thin adapter); the translation layer it replaced is gone (no longer asserted).
