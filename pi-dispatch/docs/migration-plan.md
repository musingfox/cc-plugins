# Pi-Dispatch Migration Plan: MAIN-Driven Parallel Dispatch

## Background

The current cf (context-flow) Pi dispatch runs its poll loop inside a sub-agent (`pi-driver.md`), which is a single-shot invocation — sub-agents cannot re-invoke themselves on background completion (F3=NO, empirically verified). This locks the poll loop inside a sub-agent that cannot yield back to MAIN between rounds, making N-shard parallelism structurally impossible from within the sub-agent.

The solution is to relocate the wait to MAIN. MAIN IS re-invoked on background completion (F3=YES for MAIN), so MAIN can launch N background Pi dispatches and watch them with the Monitor tool — achieving true parallelism across shards via the star topology.

---

## Target Architecture

The post-migration dispatch model is MAIN-driven:

1. **MAIN** launches N shard dispatches in parallel using the Bash tool with `run_in_background=true` (one call per shard, returns immediately with a background job handle).
2. **Monitor** tool in MAIN watches each background job stream for completion events — MAIN is re-invoked on each event and routes accordingly (no sub-agent poll loop needed).
3. **outcome.md** (paths-only filtering) — each shard shell script (`cf-pi-run.sh`) already writes a structured `outcome.md` to `$SHARD_SESSION/outcome.md` (see `cf-pi-run.sh:125`). Post-migration, MAIN reads this file directly for routing decisions; no inline log content is passed through the agent boundary.
4. **Optional distiller sub-agent** — invoked only on failure (a shard that writes `FAIL` or `NEEDS_REPLAN` to outcome.md). The distiller reads the bounded `outcome.md` and produces a compressed return for MAIN. On PASS, no sub-agent is spawned; MAIN routes directly from outcome.md paths.
5. The `agent_end` whitelist in `pi-dispatch/scripts/pi-poll.sh` (SUCCESS WHITELIST: `agent_end.stopReason==stop` AND non-empty result AND process dead) and the frozen stdout contract `OUTPUT=/PID=/RUNDIR=` (OWD-2, `pi-dispatch.sh:196-198`) are KEPT unchanged — the MAIN-side Monitor reads the same STATUS= grammar that the whitelist enforces.

---

## Component Fate Table

| Component | Fate | Reversibility | Cite |
|---|---|---|---|
| `cf-pi-dispatch.sh` | CHANGE — thin dispatch stays; resolver dedup collapses the duplicated sibling-search logic currently present in both `cf-pi-dispatch.sh` and `cf-pi-poll.sh` into a single shared helper | two-way | `context-flow/scripts/cf-pi-dispatch.sh:27-34` (sibling resolver block) |
| `cf-pi-poll.sh` | CHANGE then DROP — STATUS→legacy-token translation layer becomes unnecessary once MAIN reads canonical STATUS= grammar directly from `pi-poll.sh`; collapses into a thin no-op or is removed | two-way | `context-flow/scripts/cf-pi-poll.sh:83-152` (full translation table) |
| `cf-pi-run.sh` | CHANGE — the 70×30s in-sub-agent poll loop (`cf-pi-run.sh:228-303`) relocates to MAIN+Monitor; `write_outcome` at `cf-pi-run.sh:67-125` stays (paths-only outcome.md is the MAIN-facing contract) | two-way | `context-flow/scripts/cf-pi-run.sh:228-231` (`while [ "$round" -lt "$max_rounds" ]` + `sleep 30`) |
| `pi-driver.md` | DROP — the Bash+Read sub-agent driver becomes redundant once MAIN is the sole driver; removing it is an outward contract change (callers of the pi-driver sub-agent must be updated) | one-way | `context-flow/agents/pi-driver.md:1-10` (sub-agent header + role definition) |
| `pi-dispatch.sh` | KEEP — canonical always-background launcher; stdout contract `OUTPUT=/PID=/RUNDIR=` (OWD-2) and group-kill (setsid/pgid) unchanged; frozen | frozen | `pi-dispatch/scripts/pi-dispatch.sh:196-198` (stdout lines) |
| `pi-build.sh` | STAY — spiral's BUILD act; see Spiral Consumer section below | n/a | `spiral/scripts/pi-build.sh:1-10` (header) |

---

## Frozen Contracts: KEEP

### agent_end Whitelist

`pi-dispatch/scripts/pi-poll.sh` enforces the SUCCESS WHITELIST: `agent_end.stopReason==stop` AND non-empty result text AND process dead (see `pi-poll.sh:40-41`, comment block). This whitelist is NOT changed by this migration. MAIN reads `STATUS=OK` or `STATUS=FAIL` output from `pi-poll.sh` directly — the whitelist meaning of `STATUS=OK` is identical regardless of whether it is translated through `cf-pi-poll.sh` or read by MAIN natively.

### Frozen Stdout Contract (OWD-2)

`pi-dispatch.sh` emits exactly three lines on stdout (OWD-2, `pi-dispatch.sh:196-198`):

```
OUTPUT=<absolute path to result file>
PID=<background wrapper pid (== PGID)>
RUNDIR=<per-run dir>
```

This contract is frozen. `cf-pi-dispatch.sh` already captures `RUNDIR=` and `PID=` from this output (`cf-pi-dispatch.sh:89-91`). Post-migration, MAIN reads the same output lines — the `OUTPUT=/PID=/RUNDIR=` contract is never modified.

---

## Migration Sequence

Steps are ordered cheapest-to-reverse first; the single one-way door is last and human-gated.

### Step 1 — resolver dedup (two-way)

**What:** The sibling resolver block (the `ls ... | sort -V | tail -1` pattern) is duplicated in both `cf-pi-dispatch.sh:27-34` and `cf-pi-poll.sh:44-49`. Extract it into `cf-pi-env.sh` (already sourced by both) as a shared `resolve_canon_dispatch` function. Both callers call the function.

**Why first:** Pure internal refactor with no behavioral change. No protocol touched. Reversible by inlining the resolver back.

**Rollback:** Revert `cf-pi-env.sh` and restore the inline resolver in both callers. No state migration needed.

---

### Step 2 — collapse cf-pi-poll translation / read canonical grammar (two-way)

**What:** Replace `cf-pi-poll.sh`'s STATUS→legacy-token translation table (`cf-pi-poll.sh:83-152`) with direct pass-through of the canonical STATUS= grammar from `pi-poll.sh`. Update `dispatch_and_poll` in `cf-pi-run.sh` to match against `STATUS=OK` / `STATUS=FAIL` / `RUNNING` directly instead of legacy tokens (DONE / ERROR / ALIVE etc.).

**Why:** Eliminates the translation layer entirely. The canonical grammar is already complete and stable; the legacy tokens exist only because cf predates the canonical pi-poll.sh. Removing the translation makes `cf-pi-poll.sh` a thin no-op (or removes it).

**Rollback:** Restore `cf-pi-poll.sh` translation table and the legacy-token `case` statement in `cf-pi-run.sh`. Git revert is sufficient; no persistent state is affected.

---

### Step 3 — MAIN-side run_in_background + Monitor driver alongside the existing path (two-way)

**What:** Add a parallel dispatch path in MAIN: MAIN launches N shard `cf-pi-run.sh` invocations via `run_in_background=true` Bash calls and watches them with the Monitor tool. The existing sub-agent (`pi-driver.md`) path remains active as the default. The new MAIN path is gated behind an env flag (e.g. `CF_MAIN_DISPATCH=1`) so it is additive and can be toggled off.

**Why:** Validates MAIN-side parallelism on real shards without removing the fallback. Monitor events fire as each shard script exits; MAIN reads `outcome.md` (paths-only) for routing.

**Rollback:** Unset `CF_MAIN_DISPATCH`; traffic reverts to the sub-agent path. No schema or protocol change.

---

### Step 4 — route cf to the MAIN driver + outcome.md + optional distiller (two-way)

**What:** Flip the default: MAIN dispatch becomes the primary path. `pi-driver.md` sub-agent is still present but no longer the default. Post-completion, MAIN reads `$SHARD_SESSION/outcome.md` (paths-only) for routing; on `FAIL` or `NEEDS_REPLAN`, MAIN optionally spawns a distiller sub-agent to compress the failure narrative. On `PASS`, MAIN routes directly with no sub-agent spawn.

**Why:** Proves the complete MAIN-driven lifecycle with optional distiller in production before the permanent DROP of `pi-driver.md`.

**Rollback:** Re-enable the `pi-driver.md` default by reverting the dispatch routing flag. The sub-agent is still present; no removal has occurred yet.

---

### Step 5 — DROP pi-driver sub-agent (one-way, OWD-1, HUMAN-GATED)

**What:** Remove `context-flow/agents/pi-driver.md`. Any callers in `cf.md` or orchestrator prompts that name `pi-driver` as the sub-agent type must be updated to the MAIN-driven dispatch. This is an outward contract change: any downstream automation that dispatches `pi-driver` by name breaks after this step.

**Why last:** This is the one-way door (OWD-1). Once the file is gone and callers are updated, reverting requires restoring the file and reverting callers — possible, but all downstream automation that was updated to the MAIN path must be reverted too. The cost of reversal grows with time.

**Human approval required** before executing this step. Confirm: (a) Step 4 has been validated in production across at least one full cf multi-shard run, (b) no external callers reference `pi-driver` by name outside the cf plugin, (c) the MAIN-driven distiller handles FAIL/NEEDS_REPLAN narratives acceptably.

**Rollback:** Restore `context-flow/agents/pi-driver.md` from git history (`git checkout <prior-sha> -- context-flow/agents/pi-driver.md`); revert caller updates. Expensive if downstream automation has already migrated.

---

## Spiral Consumer: pi-build.sh

`spiral/scripts/pi-build.sh` (see `pi-build.sh:1-10`) STAY — no migration needed.

Reason: `pi-build.sh` runs inside a **single-shot convergence sub-agent** (spiral's BUILD act). There is no N-shard fanout: spiral dispatches exactly one Pi per BUILD invocation. The poll loop inside `pi-build.sh` (blocking, short intervals) is correct for that shape — the sub-agent is single-shot and the poll loop terminates before the Bash tool ceiling. The MAIN-driven `run_in_background` + Monitor pattern solves a problem (`pi-build.sh` does not have: parallel N-shard wait in a re-invocable context). Migrating `pi-build.sh` would add complexity with no benefit. The canonical `pi-dispatch.sh` it calls (OWD-2) is unchanged.
