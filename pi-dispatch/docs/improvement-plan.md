# Pi Dispatch Improvement Plan

## Root cause

The setsid/pgid/disown/poll machinery in `pi-dispatch/scripts/pi-dispatch.sh` (lines 122–193) exists for one reason: a Pi invocation that runs longer than 600 seconds would be killed by the Claude Code Bash-tool ceiling. The perl `POSIX::setsid()` wrapper (line 142/165) creates a new process-group leader so the wrapper and all Pi descendants can be group-killed with a single `-$PGID` signal later. The wrapper is immediately `disown`ed (line 193) so the Bash tool returns instantly with the run handle — the caller polls for completion separately.

This ceiling is the explicit context in `context-flow/agents/pi-driver.md:35`:

> "harness max is 600s so request `timeout: 600000` — if the shard runs longer than 10min the Bash call will return with no exit status"

Everything downstream — `pi-poll.sh`, `cf-pi-dispatch.sh`, `cf-pi-poll.sh`, `cf-pi-stop.sh`, `pi-build.sh` — exists to manage the gap between "dispatch returned" and "Pi finished." That is the root complexity, and any improvement plan must address how to close or shrink that gap.

---

## Options

### `run_in_background` (native background-task)

The Bash tool's `run_in_background` parameter lets the harness re-invoke the agent when the background command exits, eliminating the poll loop entirely. This pattern is already proven in-repo: `spiral/scripts/wait-decision.sh` is launched with `run_in_background` from the MAIN spiral agent (`spiral/commands/spiral.md:143–148`), and the harness re-invokes the agent when `wait-decision.sh` exits.

**Trade-off.** If this works from a sub-agent (the `pi-driver`, which is Bash+Read only), it could eliminate the entire dispatch/poll/stop/pgid machinery — `pi-dispatch.sh`, `pi-poll.sh`, `pi-stop.sh`, the pgid file, and all four adapter scripts would collapse to a single blocking `pi` invocation. The information-filtering layer simplifies too: `write_outcome` in `context-flow/scripts/cf-pi-run.sh:67–126` already produces `outcome.md` as a paths-only structured result; the sub-agent's marginal filtering value post-completion is thin, so an optional post-completion distiller (spawned only on FAIL/NEEDS_REPLAN) would suffice rather than a permanent polling sub-agent.

**Door class: one-way.** Collapsing `pi-driver` and removing the poll machinery (OWD-1) cannot be partially done. Once the dispatch/poll/stop scripts are removed and callers are rewritten to depend on `run_in_background` re-invoke, reverting requires restoring the entire layer. The canonical stdout contract `OUTPUT=/PID=/RUNDIR=` (OWD-2) should remain frozen even in this path — downstream consumers depend on it and changing it is a separate one-way door.

**UNKNOWN — gating empirical test (F3).** The `run_in_background` + auto-re-invoke pattern is established for the MAIN command agent: `spiral/scripts/wait-decision.sh:1–35` and `spiral/commands/spiral.md:143–148` demonstrate it in-repo. Whether this same harness behavior applies to a restricted `pi-driver` sub-agent (Bash+Read only) is an open question.
This must be empirically resolved before any architectural commitment to this option.

---

### `subagent-fanout` (synchronous pi call + multiple pi-driver subagents fanned out, each blocking its own shard)

Each shard's `pi-driver` sub-agent makes a synchronous blocking `pi` call (no dispatch, no poll). Parallelism comes from fanning out multiple `pi-driver` sub-agents concurrently, each blocking on its own shard. The 600s ceiling is still present per sub-agent, so shards must fit under approximately 9 minutes wall-clock.

**Trade-off.** This eliminates the poll loop and the pgid wrapper for any shard that completes within the ceiling. The information-filtering layer remains unchanged in shape: `write_outcome` in `context-flow/scripts/cf-pi-run.sh:67–126` already writes `outcome.md` as paths-only structured output. With synchronous blocking, the sub-agent reads `outcome.md` immediately on return — no polling, no `pi-rundir` indirection. The risk is shard ceiling violation: any shard whose Pi run exceeds ~9 minutes causes the Bash call to return with no exit status, requiring a fallback poll (partial degradation, not total failure). Parallelism is bounded by the number of sub-agents the harness allows concurrently.

**Door class: two-way.** Shard sizing is a tunable. If a shard consistently overshoots, it is split smaller. The synchronous-vs-poll trade is reversible: a sub-agent that times out can fall back to re-polling `outcome.md` existence. No external contract changes.

---

### `status-quo` (keep the hand-rolled setsid/disown/pgid + sleep-poll machinery)

Keep `pi-dispatch.sh` (perl `POSIX::setsid` wrapper, `disown`, pgid file), `pi-poll.sh` (process-state-first poll, `agent_end` whitelist, stall/timeout, no-rc grace), and the four adapter scripts (`cf-pi-dispatch.sh`, `cf-pi-poll.sh`, `cf-pi-stop.sh`, `pi-build.sh`). The poll loop in `context-flow/scripts/cf-pi-run.sh:228–303` (70 rounds × 30s) remains the runtime backbone.

**Trade-off.** The machinery works and is battle-tested. The information-filtering layer is already in the right place: `write_outcome` at `context-flow/scripts/cf-pi-run.sh:67` produces `outcome.md` with paths only — the sub-agent reads a bounded structured file rather than raw Pi output. The marginal filtering value of the sub-agent layer is thin but non-zero: it distills the structured outcome into the fixed return schema for the main orchestrator. The cost is the double-translation path (Pi JSON stream → `outcome.md` → sub-agent distillation → main orchestrator) and the duplicated sibling-resolver glob across four scripts (see Blast radius below). It also leaves the system exposed to the 70-round ceiling: a shard that runs longer than 70 × 30s = 35 minutes hits `FAIL poll-ceiling` regardless of Pi's actual progress.

**Door class: reversible.** No architectural change; incremental cleanup (deduplicating the resolver, tightening the ceiling) is always open.

---

## Blast radius

Three plugins are affected by changes to the Pi dispatch machinery:

- **spiral** — consumes the canonical primitive via `spiral/scripts/pi-build.sh`. Shape: synchronous-blocking, caps wall-clock at 480s (`pi-build.sh:72`) — deliberately under the 600s harness ceiling. One poll loop, one OUTCOME line out. The agent (BUILD act in `spiral/commands/spiral.md`) runs the gate itself after `pi-build.sh` returns; it never enters a background/re-invoke pattern for the build phase.

- **context-flow (cf)** — consumes the canonical primitive via the adapter trio: `cf-pi-dispatch.sh`, `cf-pi-poll.sh`, `cf-pi-stop.sh`. Shape: background dispatch + poll-loop driven from `cf-pi-run.sh`. The poll loop (`cf-pi-run.sh:228–303`) runs inside a sub-agent (`pi-driver`), which blocks for up to 70 rounds × 30s. This is fundamentally different from spiral's synchronous-blocking shape.

- **pi-dispatch** — the canonical primitive itself. Changes here propagate to all consumers.

**Duplicated sibling-resolver.** The glob pattern that resolves the canonical `pi-dispatch.sh` path is duplicated across at least four files:

- `spiral/scripts/pi-build.sh:44–48`
- `context-flow/scripts/cf-pi-dispatch.sh:30–34`
- `context-flow/scripts/cf-pi-poll.sh:45–49`
- `context-flow/scripts/cf-pi-stop.sh:22–26`

Each carries an identical four-path glob that searches sibling and parent-level `pi-dispatch/` trees at two depths (flat and versioned layouts). Any change to the canonical install path must be replicated in all four. This is a maintenance hazard independent of which option is chosen.

---

## Record: run_in_background sub-agent behavior is an open unknown

Native `run_in_background` + auto-re-invoke-on-exit is **PROVEN** for the main command agent. Evidence: `spiral/scripts/wait-decision.sh` is explicitly documented as "Run this with the Bash tool's `run_in_background`" (line 6), and `spiral/commands/spiral.md:143–148` instructs the main spiral agent to launch it that way, with the harness re-invoking the agent on exit.

For a restricted sub-agent such as `pi-driver` (tools: Bash, Read only), the analogous behavior is an open unknown. The question is whether the harness applies the same re-invocation logic to a sub-agent context.
This has not been tested. The `run_in_background` option must not be chosen until this is empirically demonstrated in a controlled sub-agent context.

---

## Recommendation

Ordered steps — each independently actionable, later steps may depend on earlier ones:

1. **Deduplicate the sibling-resolver (independent of all other choices).** Extract the four-path glob from `pi-build.sh:44–48`, `cf-pi-dispatch.sh:30–34`, `cf-pi-poll.sh:45–49`, and `cf-pi-stop.sh:22–26` into a shared sourced helper under the pi-dispatch scripts directory (e.g., a `pi-resolve.sh` script). Each adapter sources it. This is a two-way door: purely internal, no external contract change, immediately corrects the 4× duplication hazard.

2. **Run the gating empirical test: does `run_in_background` re-invoke a restricted sub-agent?** Write a minimal sub-agent (Bash+Read only) that launches a 5s sleep with `run_in_background` and observe whether the harness re-invokes it on exit. This is the blocking unknown (F3). The `run_in_background` option cannot be chosen until this test passes — OWD-1 (collapsing `pi-driver`) is gated on this result.

3. **If F3 confirms sub-agent re-invoke: migrate cf to `run_in_background` + collapse `pi-driver`.** Replace the `cf-pi-dispatch.sh` + `cf-pi-poll.sh` + `cf-pi-stop.sh` adapter trio and the 70-round poll loop in `cf-pi-run.sh:228–303` with a single blocking `pi` invocation inside `pi-driver`, launched with `run_in_background`. Retain `write_outcome` in `cf-pi-run.sh:67–126` as the `outcome.md` interface — the post-completion distiller reads it on FAIL/NEEDS_REPLAN only. Keep the canonical `OUTPUT=/PID=/RUNDIR=` stdout contract frozen (OWD-2). This is a one-way door (OWD-1): flag for human approval before crossing.

4. **If F3 does NOT confirm sub-agent re-invoke: adopt `subagent-fanout` instead.** Replace the background-dispatch + poll shape with synchronous blocking `pi` calls, one per sub-agent, fanned out in parallel. Tune shard sizing so each fits under ~9 minutes. The information-filtering layer (`write_outcome` / `outcome.md`) is unchanged. The adapter trio can be simplified or removed incrementally since no background management is needed.

5. **Regardless of option chosen: freeze the canonical stdout contract `OUTPUT=/PID=/RUNDIR=` (OWD-2).** Any consumer that parses this format must be enumerated before any change to `pi-dispatch.sh`'s stdout format. Changing this contract is a separate one-way door that requires coordinated migration of all three plugins.
