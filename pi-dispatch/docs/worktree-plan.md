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

2. **Confirm-dead poll** — after issuing the kill, poll until
   `kill -0 $PGID` returns non-zero (the group is gone):

   ```bash
   until ! kill -0 "$PGID" 2>/dev/null; do sleep 0.2; done
   ```

   This poll ensures the process group is fully dead before proceeding.

3. **`git worktree remove --force`** — only after the confirm-dead poll returns.

**Race rationale:** A live descendant can hold an `index.lock` inside `$WORK` or
an administrative file under `.git/worktrees/<id>`. Removing the worktree with a
live descendant holding `$WORK` produces unpredictable behavior — the kernel may
block the remove or leave stale refs.

**This confirm poll is an addition over the current cf behavior.** Today,
`cf-pi-stop.sh` (the thin adapter) falls back to only `sleep 2` before issuing
the final `kill -9` — it does not poll for confirmed group death. The sequence in
`cf-pi-run.sh:236` (the `fail_kill` / abort-then-cleanup ordering) already models
the correct intent: call `cf-pi-stop.sh --abort` first, then proceed with cleanup.
The hoisted primitive hardens this by replacing the fixed `sleep 2` with an active
`kill -0` poll loop, making worktree removal race-free.

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
EX-10) corresponds to a section defined here. No dangling references.
