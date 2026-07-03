# Parallel Sharded Implement — Design

Status: implemented (Phase 3 of `/cf`)
Scope: fan out OMP work in parallel as main-launched background tasks; main reads paths-only outcomes and routes structured escalations without bouncing through the user.

Operational detail lives in `commands/cf.md` (orchestration) and `docs/pi-implementer-protocol.md` (worker contract). This document records the architecture and the decisions behind it.

## 1. Architecture

```
goal → Plan (contracts.json) → cf-pi-shard.sh (file-touch graph → shards)
     → N × cf-pi-run.sh (background task: worktree → brief → dispatch → poll → gates → outcome.md)
     → main collects paths-only outcomes → route:
         all PASS        → integration gate (merge + full suite) → review
         any NEEDS_REPLAN → coalesced partial-replan → re-fan-out affected shards
         any FAIL        → retry once → escalate
```

| Layer | Owns | Claude-token cost |
|---|---|---|
| Main orchestrator | fan-out decisions, reading paths-only `outcome.md`, routing, integration, user-facing summary | bounded reads only |
| `cf-pi-run.sh` (per shard, background task) | full worker lifecycle in pure shell; heavy stdout goes to the task's own output file | zero |
| OMP worker | implement contracts, per-contract commit, write report/escalate file | zero (separate billing) |

No sub-agent sits between main and a shard: the background-task output split IS the token firewall (its stdout never enters main's context).

## 2. Sharding Model

Sharding is derived from a **file-touch graph**, not declared by Plan — two shards can never edit the same file, so integration merges are conflict-free by construction (semantic regressions excepted; the integration gate catches those).

Plan emits paired artifacts: `plan.md` (human prose) + `contracts.json` (machine-readable sidecar, schema-versioned). Orchestration scripts read **only** `contracts.json` — never parse plan.md.

`contracts.json` per contract: `name` (stable id), `summary`, `touches_files` (superset of every file created/modified, tests included — underset is a bug, post-validated by cf-pi-run.sh), `test_cases` (`{id, given, expect}`), `attachments` (paths under `plan-attachments/` for rich prose; default empty).

`cf-pi-shard.sh`: nodes = contracts, edge ⇔ shared touched file, one shard per connected component → `shards.json` `{fan_out_count, groups:{id:{contracts,files}}}`. `fan_out_count == 1` IS the single-worker case — same code path.

## 3. Isolation & Recoverability

Each shard runs in its own git worktree on its own branch (`cf/<slug>-shard-<id>`); checkpoint tag `cf-checkpoint/<flow>/shard-<id>@<sha>` on PASS.

Recoverability ladder:
1. **Per-contract commit**: failed contracts leave no commit; a partial shard branch holds only validated work.
2. **Per-shard branch**: one shard's collapse never touches another's commits.
3. **Checkpoint tag**: surgical rollback target, survives flow cleanup.
4. **Integration gate**: merge into transient `cf/<slug>-integrated` (sibling naming — a `/integrated` suffix would collide with the shard branch refs) and run the full suite; the parent cf branch is touched only after integration passes.

Worst case: flow aborts, all branches and tags remain; the user cherry-picks validated contract commits manually.

## 4. Outcome Statuses & Round Collection

| Status | Trigger | Routing |
|---|---|---|
| `PASS` | all shard contracts survive gates + file-scope check | tag checkpoint, mark done |
| `FAIL` | infrastructure failure (probe, dispatch, stall, missing outcome) | retry once; second FAIL → escalate |
| `NEEDS_REPLAN` | escalate-file present; persistent test fail after one in-shard re-dispatch; undeclared file touched | coalesce, partial-replan the affected contracts |

`outcome.md` is **bounded by construction**: every value is a short enum/id, a filesystem path, or the single `## Cause` line (≤300 chars, extracted from the artifact matching the failure reason) — never inlined content, so the read is bounded no matter what happened inside the shard.

**Round-collection rule**: main waits for ALL shards in a round before routing, so NEEDS_REPLAN coalesces into a single Plan invocation and replans never interleave.

## 5. Replan Ladder

Never silently waste validated work. Partial-replan is the default; Plan owns the escalation to rollback.

- Plan (mode `partial-replan`) receives affected contracts + preserve-interfaces list + escalate paths, and returns either `contracts-revision-<n>.json` (replace-by-name, applied by `cf-pi-merge-revision.sh` via jq, schema_version validated) or `replan-status.json` with `REPLAN_REQUIRES_ROLLBACK` when the fix demands changing a preserved interface.
- Rollback resets the named shard checkpoints, then a full Plan re-invocation.
- Integration-gate test failure auto-injects NEEDS_REPLAN for the contracts whose tests failed in the merged checkout, funneling into the same ladder.

`contracts.json` is the load-bearing artifact; `plan.md` prose drift is tolerable, contracts drift is not.

## 6. Limits

| Limit | Threshold | On breach |
|---|---|---|
| Replan attempts per contract | 2 | escalate to user |
| Rollback cycles per flow | 2 | escalate to user |
| FAIL retries per shard per round | 1 | escalate to user |

## 7. Token Discipline (non-negotiable)

Main must never hold flow artifacts in context. Structural guarantee: each shard is a background task, so its stdout can't leak into main; convention covers the rest.

Never enters main: `contracts.json` bodies, worker reports, JSONL event streams, test logs, briefs, escalate bodies, revision JSON, diffs. All live on disk; main passes **paths**.

Every read main performs on a flow artifact is bounded: `Read(file, limit=N)`, `jq '.field'`, `head/tail -N`, `sed -n '/^## X/,/^## Y/p'`. Unbounded `cat`/`Read` on any artifact > 1KB is forbidden.

Anti-growth: `dispatch-state.json` holds only the latest round (~1KB); history is appended to `dispatch-state-archive.jsonl`, never read by main during a flow. Gate-3 retest and in-shard resume re-brief happen inside `cf-pi-run.sh` — main never re-launches for a test failure, only for infrastructure FAIL.

## 8. Observability

Pull, not push. Each background task's progress lines go to its own output file (`TaskOutput`/`Read` on demand) and its latest line is mirrored to `$SHARD_SESSION/progress`; `cf-pi-status.sh $SESSION` prints one line per shard — liveness + current lifecycle phase (read-only, safe any time). The orchestrator runs it on every wake-up while shards are pending and reports non-PASS causes from `## Cause`, so the human is never blind mid-run and never sees a bare FAIL.

## 9. Open Risks

- **Escalation discipline**: the worker must use `$ESCALATE_FILE` instead of silently giving up or claiming success; the gates are the defense in depth.
- **`touches_files` underset**: understated file lists let shards collide at runtime. `cf-pi-run.sh` post-validates `actual ⊆ declared` (root build/lock manifests allowlisted as warnings) and NEEDS_REPLANs on violation. Verified real in early dogfooding (N=1 plan trial omitted doc cross-references).
- **Cross-shard semantic regressions**: different-file edits can still break shared invariants; the integration gate's full suite is the only net.
- **Disk pressure**: cap fan-out at N ≤ 6 by default; worktrees are removed after integration.

## 10. Decisions Locked In

A. Shard granularity = connected components of the file-touch graph; script-derived, never Plan-declared.
B. Per-shard worktree + branch + checkpoint tag.
C. Partial-replan default; Plan owns rollback escalation; limits per §6.
D. Paired `plan.md` + schema-versioned `contracts.json`; scripts read only the JSON.
E. Integration failure auto-injects NEEDS_REPLAN.
F. Single flow; N=1 walks the same path.
G. No distillation sub-agent — the background-task output split enforces the token firewall.
H. Contract revisions applied by `cf-pi-merge-revision.sh` (jq), not by main's Edit tool.
I. Rich-prose escape hatch: `attachments` in contracts.json, included verbatim in briefs.
