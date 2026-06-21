# Pi-Dispatch Migration Plan: Option B — Internal Modernization

## Background

The current cf (context-flow) Pi dispatch runs its poll loop inside `cf-pi-run.sh`, invoked
by the `pi-driver` sub-agent (`context-flow/agents/pi-driver.md:1-12`). The sub-agent is a
distiller, not a driver: it invokes `cf-pi-run.sh` and reads `$SHARD_SESSION/outcome.md`
(`pi-driver.md:12-15`). Internally, `cf-pi-run.sh` polls via `cf-pi-poll.sh`, which is a
hand-rolled translation layer that converts canonical `STATUS=` grammar emitted by
`pi-dispatch/scripts/pi-poll.sh` back into cf's legacy token vocabulary (DONE, ALIVE, ERROR,
etc.) so the `dispatch_and_poll` loop in `cf-pi-run.sh:220-311` can match against those tokens.

That translation layer is unnecessary overhead. Native `run_in_background` + the Monitor tool
can replace the hand-rolled `setsid`/pgid/custom-sleep poll machinery entirely — and since
ARM-TASK empirically proved a sub-agent can run a background task and poll it with Monitor
within one invocation, this swap can happen entirely within `cf-pi-run.sh`'s dispatch-and-poll
internals, without relocating the lifecycle or the token firewall.

---

## Architecture Invariants (no OWD-1, no one-way doors)

This plan introduces **no OWD-1**. Every step is two-way. The §17 token **firewall** is
**preserved unchanged**: `pi-driver.md` remains the sole agent boundary, `outcome.md` remains
paths-only, and MAIN reads only `outcome.md` (at `$SHARD_SESSION/outcome.md`) — unchanged
from the current contract.

---

## Target Architecture

The post-migration dispatch model keeps pi-driver as the **sole driver of one shard within its
single invocation**. The `pi-driver` sub-agent (`context-flow/agents/pi-driver.md:1-12`)
continues to invoke `cf-pi-run.sh` and distill its structured result into the fixed return
schema. What changes is inside `cf-pi-run.sh`'s `dispatch_and_poll` function:

1. `dispatch_and_poll` (`cf-pi-run.sh:220-311`) replaces the hand-rolled 70×30s sleep loop
   and the `cf-pi-poll.sh` token-translation calls with native `run_in_background` + the
   Monitor tool, polled within the sub-agent invocation. The whole lifecycle stays in the
   sub-agent — no phase relocates to MAIN.
2. `write_outcome` (`cf-pi-run.sh:67-147`) and the gate pipeline (`cf-pi-run.sh:326-465`)
   are unchanged; they still produce `$SHARD_SESSION/outcome.md` in paths-only format.
3. MAIN reads ONLY `outcome.md` — the paths-only boundary artifact at
   `$SHARD_SESSION/outcome.md`. This is unchanged from today.
4. The §17 token firewall (agent boundary = pi-driver sub-agent; no inline log content
   crosses the boundary; MAIN sees only paths) is **preserved unchanged**.

---

## Component Fate Table

| Component | Fate | Reversibility | Cite |
|---|---|---|---|
| `pi-driver.md` | KEEP — firewall boundary; the pi-driver sub-agent stays as the sole orchestrator of one Pi run per invocation; outcome.md contract is the only cross-boundary artifact | two-way | `context-flow/agents/pi-driver.md:1-12` |
| `cf-pi-poll.sh` | REMOVE translation layer — the STATUS→legacy-token table (82 lines) becomes unnecessary once `dispatch_and_poll` reads canonical STATUS= grammar directly via Monitor | two-way | `context-flow/scripts/cf-pi-poll.sh:82-152` |
| `cf-pi-run.sh` | CHANGE — only `dispatch_and_poll` internals (`cf-pi-run.sh:220-311`, loop `:228-231`) swap from sleep+legacy-poll to native run_in_background+Monitor; all other lifecycle steps stay | two-way | `context-flow/scripts/cf-pi-run.sh:220-311` |
| `cf-pi-dispatch.sh` | CHANGE — resolver dedup; collapses the duplicated sibling-search block into a shared helper | two-way | `context-flow/scripts/cf-pi-dispatch.sh:27-34` |
| `pi-dispatch.sh` | KEEP — canonical always-background launcher; stdout contract `OUTPUT=/PID=/RUNDIR=` (OWD-2) and group-kill unchanged; frozen | frozen | `pi-dispatch/scripts/pi-dispatch.sh:196-198` |
| `pi-build.sh` | STAY — spiral's BUILD act; out-of-scope for this migration (explained below) | n/a | `spiral/scripts/pi-build.sh:44-48` |

---

## Frozen Contracts: KEEP

### agent_end Whitelist (pi-poll.sh)

`pi-dispatch/scripts/pi-poll.sh` enforces the SUCCESS WHITELIST: `agent_end` present AND `stopReason=="stop"` AND result non-empty (see `pi-poll.sh:40-49`).
This whitelist is NOT changed by this migration. After the swap, `dispatch_and_poll` reads
`STATUS=OK` / `STATUS=FAIL` directly from Monitor output — the whitelist's meaning of
`STATUS=OK` is identical; only the translation hop is removed.

### Frozen Stdout Contract (OWD-2)

`pi-dispatch.sh` emits exactly three lines on stdout (`pi-dispatch.sh:196-198`):

```
OUTPUT=<absolute path to result file>
PID=<background wrapper pid (== PGID)>
RUNDIR=<per-run dir>
```

`OUTPUT=`, `PID=`, and `RUNDIR=` are marked **frozen / OWD-2**. `cf-pi-dispatch.sh` already
captures `RUNDIR=` and `PID=` from this output. Post-migration, no new consumer reads these
lines — the OWD-2 contract is never modified.

---

## Spiral Consumer: pi-build.sh

`spiral/scripts/pi-build.sh:44-48` is **out-of-scope** for this migration. It runs inside
spiral's BUILD convergence sub-agent, which is single-shot with no N-shard fanout. Its
blocking poll loop (short interval) terminates before the Bash tool ceiling. Migrating
`pi-build.sh` would add complexity with no benefit; it calls `pi-dispatch.sh` (OWD-2),
which is unchanged.

---

## Migration Sequence

Steps are ordered cheapest-to-reverse first. All steps are two-way.

### Step 1 — resolver dedup (two-way)

**What:** The sibling-resolver block (`ls ... | sort -V | tail -1`) is duplicated in three cf
scripts: `cf-pi-dispatch.sh:27-34`, `cf-pi-poll.sh:44-49`, and `cf-pi-stop.sh:22-26`. Extract
it into `cf-pi-env.sh` (already sourced by all three) as a shared `resolve_canon_dispatch`
function. Each of the three callers replaces its inline block with a single function call.
`spiral/scripts/pi-build.sh:44-48` carries its own twin of this resolver and is out-of-scope
— it is not touched.

**Why first:** Pure internal refactor; no protocol or behavioral change. Confirms the shared
helper works across all three callers before any behavioral steps.

**Rollback:** Revert `cf-pi-env.sh` and restore the inline resolver in each of the three
callers (`cf-pi-dispatch.sh`, `cf-pi-poll.sh`, `cf-pi-stop.sh`). No state migration needed.

---

### Step 2 — retire cf-pi-poll translation layer (two-way)

**What:** Delete the STATUS→legacy-token translation table in `cf-pi-poll.sh:82-152`. Update
`dispatch_and_poll` in `cf-pi-run.sh:220-311` to match canonical `STATUS=OK` / `STATUS=FAIL`
/ `RUNNING` grammar directly, bypassing the adapter.

Two test files must migrate alongside this step:

- `poll-json.test.sh` — its asserts exercise the legacy token vocabulary; migrate all
  assertions to the canonical `STATUS=` grammar, since the legacy tokens will no longer exist.
- `gate3-retest.test.sh` — at `:64` it stubs `cf-pi-poll.sh` to `echo DONE`; update the
  stub to emit `STATUS=OK` so the retest behavior continues to be exercised against the
  canonical grammar.

**Why:** Eliminates the translation layer entirely. The canonical STATUS= grammar is complete
and stable; the legacy tokens existed only because cf predated pi-poll.sh.

**Rollback:** Restore the translation table in `cf-pi-poll.sh`, revert the `dispatch_and_poll`
case statement in `cf-pi-run.sh`, and revert both test files. Git revert is sufficient; no
persistent state is affected.

---

### Step 3 — swap dispatch_and_poll internals to native run_in_background + Monitor (two-way)

**What:** Replace the hand-rolled `sleep 30` / `cf-pi-poll.sh` loop inside `dispatch_and_poll`
(`cf-pi-run.sh:220-311`, core loop `:228-231`) with native `run_in_background` for the Pi
dispatch call and Monitor tool polling within the sub-agent invocation. The whole lifecycle
stays in the sub-agent: `write_outcome` (`cf-pi-run.sh:67-147`) and the gate pipeline
(`cf-pi-run.sh:326-465`) are not moved. Only `dispatch_and_poll`'s internals change.

**Why:** Removes the custom setsid/pgid/poll machinery that cf-pi-poll.sh formerly bridged.
ARM-TASK proved a sub-agent can run_in_background and poll its own background task with Monitor
within one invocation, so this swap is fully contained inside the sub-agent boundary.

**Rollback:** Restore the `sleep 30` / `cf-pi-poll.sh` loop in `dispatch_and_poll`. `cf-pi-poll.sh`
is still present at this point (removed in a later cleanup pass if desired). Git revert is
sufficient; the token firewall and outcome.md contract are unchanged.
