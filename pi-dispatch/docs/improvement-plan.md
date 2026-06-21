# Pi Dispatch Improvement Plan

## Root cause

The setsid/pgid/disown/poll machinery in `pi-dispatch/scripts/pi-dispatch.sh` (lines 122–193) exists for one reason: a Pi invocation that runs longer than 600 seconds would be killed by the Claude Code Bash-tool ceiling. The perl `POSIX::setsid()` wrapper (line 142/165) creates a new process-group leader so the wrapper and all Pi descendants can be group-killed with a single `-$PGID` signal later. The wrapper is immediately `disown`ed (line 193) so the Bash tool returns instantly with the run handle — the caller polls for completion separately.

This ceiling is the explicit context in `context-flow/agents/pi-driver.md:35`:

> "harness max is 600s so request `timeout: 600000` — if the shard runs longer than 10min the Bash call will return with no exit status"

Everything downstream — `pi-poll.sh`, `cf-pi-dispatch.sh`, `cf-pi-poll.sh`, `cf-pi-stop.sh`, `pi-build.sh` — exists to manage the gap between "dispatch returned" and "Pi finished." That is the root complexity, and any improvement plan must address how to close or shrink that gap.

---

## First-Principles Re-Derivation

The goal here is to derive the dispatch mechanism FROM the irreducible constraints — not from the current setsid/disown/pgid/poll design. The existing machinery is an answer; this section asks what answer the constraints force.

### Irreducible constraints

- **C1 — Bash 600s ceiling.** Any single Bash tool call is killed at 10 min (`context-flow/agents/pi-driver.md:35`). No single blocking call can safely hold a Pi run of unknown duration.
- **C2 — Star topology.** Sub-agents cannot spawn sub-agents; only MAIN can fan out (project constraint). Parallelism is therefore a MAIN-level capability, never a sub-agent capability.
- **C3 — F3 unknown.** Harness auto-re-invoke-on-background-exit is PROVEN for the MAIN agent (`spiral/scripts/wait-decision.sh`, `spiral/commands/spiral.md:142-148`) but UNVERIFIED for a restricted sub-agent. This unknown is the load-bearing gate on the cheapest improvement path.
- **C4 — Pi's terminal signal.** Pi is a CLI emitting a `--mode json` event stream; `agent_end` is the only terminal truth; the process exit code carries no semantics (`pi-dispatch/scripts/pi-poll.sh:28-50`). Cancel = group-kill the detached pgid.
- **C5 — Shared primitive.** The canonical dispatch is shared by 3 plugins via a frozen stdout contract `OUTPUT=/PID=/RUNDIR=`. Any change to this interface is a 3-plugin blast.
- **C6 — Work shape.** Pi work is long, token-heavy, possibly parallel, and needs result filter to keep MAIN context clean. The filter must happen outside main context and yield a small artifact.

### Decomposition into five sub-problems and constraint-derivation

**SP1 — Who holds the wait across the 600s ceiling?**
Given the C1 ceiling, whoever holds the wait must either (a) finish under 600s or (b) be re-invoked by the harness on background-process exit. From C1+C3, the proven holder of pattern (b) is MAIN via `run_in_background`/Task. A sub-agent can only satisfy C1 by self-polling within ≤600s slices — which is exactly what the legacy design does — and that design exists ONLY because F3 (C3) was never tested. The first-principles holder is the harness (background), not a hand-rolled poll loop. The sub-agent self-poll is accidental complexity, not a constraint-derived necessity.

**SP2 — Who provides parallelism?**
Since sub-agents cannot spawn sub-agents (C2), only MAIN can fan out. The legacy "sub-agent drives one shard" yields parallelism solely because MAIN already fans out N pi-driver sub-agents — the parallel point is MAIN regardless. Minimal mechanism: MAIN fans out N background dispatches (or N sub-agents); parallelism is never a sub-agent capability and should not be encoded there.

**SP3 — Who filters the result?**
Given C6, filtering must happen outside main context and yield a small artifact. The shell already does this: the paths-only `write_outcome`/`outcome.md` in `cf-pi-run.sh:67-126` is the filter. A sub-agent is NOT required to filter — the shell filters; a sub-agent is just one optional reader. Minimal mechanism: shell-writes-outcome + an OPTIONAL post-completion distiller sub-agent only when cross-artifact narrative synthesis is needed (FAIL/NEEDS_REPLAN). The double token-translation path (Pi JSON stream → `outcome.md` → sub-agent distillation → main) exists because a sub-agent was used; it follows from no constraint.

**SP4 — How are cancel/stall/timeout bounded?**
Since the exit code carries no semantics (C4), `agent_end` is the only terminal truth; timeout = wall-clock bound, stall = stream staleness, cancel = group-kill the detached pgid. The current process-state-first check + `agent_end` whitelist in `pi-poll.sh:28-50` + group-kill in `pi-stop.sh` is first-principles-correct. This machinery should be KEPT regardless of which SP1 path is chosen; it encodes the constraint directly.

**SP5 — How does the shared primitive stay stable?**
Given C5, the stdout grammar `OUTPUT=/PID=/RUNDIR=` is the interface. Stability follows from freezing it (OWD-2) and letting consumers evolve independently. Any improvement that preserves this contract is plugin-local and safe; any change to it is a 3-plugin coordinated blast. This is a constraint, not a preference.

### Judgement: mapping the derivation onto the existing options

- **`run_in_background`**: CONFIRMED as the right SP1 wait-mechanism for MAIN-driven dispatch; gated on F3 (C3) for sub-agent-driven dispatch. The real variable is "who drives — MAIN or sub-agent," not "background vs poll." Since the C2 star topology already means MAIN is the parallelism point (SP2), driving from MAIN with `run_in_background` is the first-principles shape. Viable for MAIN today; blocked for sub-agent until F3 is resolved.

- **`subagent-fanout`**: REFRAMED — parallelism is always MAIN's job (SP2/C2), so this option is really "MAIN-fanout of sub-agents each self-polling." It is consistent with the derivation's conclusion (MAIN holds the wait), but it is the heavier shape: each sub-agent still self-polls in ≤600s slices because F3 is untested. The one-way door classification is therefore correct and unchanged; this requires coordinated rewrites across all three plugins before any benefit is realized.

- **`status-quo`**: CONSISTENT with the constraints but carries accidental complexity that follows from no constraint. The sub-agent self-poll exists only because F3 is untested (SP1); if F3 is confirmed, the poll loop has no constraint-derived justification. The double token-translation and 4× resolver duplication likewise follow from no constraint and are pure accidental cost. Status-quo is defensible only as "we have not yet tested F3."

- **`chunked-session-resume`**: CONFIRMED as the cheapest C1-dissolving lever for SP1. Chunking under 600s via existing `--session` (`pi-dispatch.sh:99-120`, `cf-pi-run.sh:412`) removes the need for a long wait-holder entirely for well-bounded shards. SP4 still needs a short poll, but the 70-round ceiling pressure is removed. This is the minimal door since door class is two-way (chunk sizing is tunable). Consistent with preserving SP4 and SP5.

### Native affordances

- **`run_in_background`**: viable for MAIN (proven C3 — MAIN path confirmed), gated for sub-agent (F3 open unknown).
- **Task tools (TaskCreate/Monitor)**: harness-native wait+notify, same MAIN-level family as `run_in_background`; viable and possibly cleaner than the self-rolled background/poll. Worth evaluating alongside `run_in_background` once F3 is resolved.
- **MCP (pi-as-MCP-server)**: if Pi exposed an MCP server, dispatch becomes a native tool call — the cleanest protocol match for SP1. However, this is pi-side work to build; it is gated and currently unknown feasibility. Attractive long-term, not free.

### Revised recommendation — explicit supersession

The first-principles derivation SUPERSEDES the prior framing. The prior framing weighed `run_in_background` vs `subagent-fanout` vs `status-quo` vs `chunked-session-resume` as roughly co-equal options differentiated by door class and ceiling risk. That framing obscured the load-bearing variable.

The derivation shows the load-bearing variable is "who holds the wait — MAIN or sub-agent," not "background vs poll." SP1+SP2 establish that the target shape is MAIN-holds-the-wait (via `run_in_background`/Task) + shell-writes-outcome (SP3) + optional distiller, with SP4 (poll whitelist + group-kill) and SP5 (frozen stdout contract) already first-principles-correct and kept unchanged. The sub-agent-driver complexity is the accidental cost of the choice to drive from a sub-agent; F3 only matters if we insist on sub-agent-driving.

The revised recommendation therefore reorders priorities: resolve F3 first (empirical test, no architectural commitment); if F3 confirms MAIN re-invoke, migrate to MAIN-driven `run_in_background` shape (OWD-1 still gated on human approval); if F3 does not confirm, `chunked-session-resume` is the cheapest structural improvement (shrinks C1 exposure, no one-way doors). Keep SP4 and SP5 in every path. The `## Recommendation` section below is updated accordingly.

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

**Architecture constraint — star topology.** A sub-agent cannot spawn sub-agents (Claude Code enforces a star topology where only the MAIN agent can fan out). This means the fan-out point must be relocated from the current sub-agent context to MAIN. That is an unscoped architecture change and a separate initiative — not a cheap drop-in. Adopting subagent-fanout requires moving the fan-out point to the main orchestrator, which touches the call shape of spiral, context-flow, and pi-dispatch consumers simultaneously.

**Trade-off.** This eliminates the poll loop and the pgid wrapper for any shard that completes within the ceiling. The information-filtering layer remains unchanged in shape: `write_outcome` in `context-flow/scripts/cf-pi-run.sh:67–126` already writes `outcome.md` as paths-only structured output. With synchronous blocking, the sub-agent reads `outcome.md` immediately on return — no polling, no `pi-rundir` indirection. The risk is shard ceiling violation: any shard whose Pi run exceeds ~9 minutes causes the Bash call to return with no exit status, requiring a fallback poll (partial degradation, not total failure). Parallelism is bounded by the number of sub-agents the harness allows concurrently.

**Door class: one-way.** Relocating the fan-out point to MAIN is not reversible without coordinated rewrites across all three plugins. The synchronous-vs-poll trade-off is also non-trivial to undo once call sites depend on the new shape. This is a one-way-ish architectural commitment, not a config tunable.

---

### `status-quo` (keep the hand-rolled setsid/disown/pgid + sleep-poll machinery)

Keep `pi-dispatch.sh` (perl `POSIX::setsid` wrapper, `disown`, pgid file), `pi-poll.sh` (process-state-first poll, `agent_end` whitelist, stall/timeout, no-rc grace), and the four adapter scripts (`cf-pi-dispatch.sh`, `cf-pi-poll.sh`, `cf-pi-stop.sh`, `pi-build.sh`). The poll loop in `context-flow/scripts/cf-pi-run.sh:228–303` (70 rounds × 30s) remains the runtime backbone.

**Trade-off.** The machinery works and is battle-tested. The information-filtering layer is already in the right place: `write_outcome` at `context-flow/scripts/cf-pi-run.sh:67` produces `outcome.md` with paths only — the sub-agent reads a bounded structured file rather than raw Pi output. The marginal filtering value of the sub-agent layer is thin but non-zero: it distills the structured outcome into the fixed return schema for the main orchestrator. The cost is the double-translation path (Pi JSON stream → `outcome.md` → sub-agent distillation → main orchestrator) and the duplicated sibling-resolver glob across four scripts (see Blast radius below). It also leaves the system exposed to the 70-round ceiling: a shard that runs longer than 70 × 30s = 35 minutes hits `FAIL poll-ceiling` regardless of Pi's actual progress.

**Door class: reversible.** No architectural change; incremental cleanup (deduplicating the resolver, tightening the ceiling) is always open.

---

### `chunked-session-resume` (Option d: chunk shards to stay under 600s, resume context via `--session`)

Decompose each Pi invocation so each chunk stays under 600 seconds wall-clock. `pi-dispatch.sh` always backgrounds and disowns the Pi process (lines 184/193) — there is no synchronous dispatch mode. What chunking each shard under the ceiling buys is removing the 70×30s long-poll loop: a short pi-build.sh-style poll suffices for chunks that return well under the ceiling. The sub-agent then resumes the Pi session context for the next chunk using the existing `--session` resume mechanism (`pi-dispatch.sh:99-120` implements `PRIOR_SESSION_ID` resume; `cf-pi-run.sh:412` re-dispatches using a session ID to resume context). This removes the long poll, not background/polling itself.

**Trade-off.** The approach works only when workloads can be reliably segmented below the 600s ceiling without breaking Pi's internal reasoning continuity. Session resume preserves context across chunks but does not guarantee mid-task coherence if a chunk cuts across a logical boundary. Monitoring and re-chunking logic must handle the case where a chunk nears the limit and must hand off cleanly. The `run_in_background` + pgid wrapper machinery could be retired entirely for well-bounded shards.

**Door class: two-way.** Chunk sizing is a tunable. If a chunk overshoots, it is reduced. The session-resume mechanism (`--session`) is already in the canonical primitive. No external contract changes; the `OUTPUT=/PID=/RUNDIR=` stdout interface is unaffected.

---

## Blast radius

Three plugins are affected by changes to the Pi dispatch machinery:

- **spiral** — consumes the canonical primitive via `spiral/scripts/pi-build.sh`. Shape: synchronous-blocking, caps wall-clock at 480s (`pi-build.sh:72`) — deliberately under the 600s harness ceiling. One poll loop, one OUTCOME line out. The agent (BUILD act in `spiral/commands/spiral.md`) runs the gate itself after `pi-build.sh` returns; it never enters a background/re-invoke pattern for the build phase.

- **context-flow (cf)** — consumes the canonical primitive via the adapter trio: `cf-pi-dispatch.sh`, `cf-pi-poll.sh`, `cf-pi-stop.sh`. Shape: background dispatch + poll-loop driven from `cf-pi-run.sh`. The poll loop (`cf-pi-run.sh:228–303`) runs inside a sub-agent (`pi-driver`), which blocks for up to 70 rounds × 30s. This is fundamentally different from spiral's synchronous-blocking shape.

- **pi-dispatch** — the canonical primitive itself. Changes here propagate to all consumers.

**OWD-2 field-granular consumer matrix.** `pi-dispatch.sh` emits three fields on stdout (lines 196–198): `OUTPUT=`, `PID=`, `RUNDIR=`. Consumers parse these selectively:

| Field    | spiral (`pi-build.sh`) | context-flow (cf)                         |
|----------|------------------------|-------------------------------------------|
| OUTPUT   | yes                    | yes                                       |
| PID      | **no** (never reads PID — `pi-build.sh:98-99` parses RUNDIR/OUTPUT only) | yes (`cf-pi-dispatch.sh:90`) |
| RUNDIR   | yes                    | yes                                       |

spiral never reads PID. cf reads PID to enable `cf-pi-stop.sh` to send a SIGTERM to the process group. Any change to the PID field's format or semantics therefore has no impact on spiral but requires coordinated migration of all cf consumers.

**Duplicated sibling-resolver.** The glob pattern that resolves the canonical `pi-dispatch.sh` path is duplicated across at least four files:

- `spiral/scripts/pi-build.sh:44–48`
- `context-flow/scripts/cf-pi-dispatch.sh:30–34`
- `context-flow/scripts/cf-pi-poll.sh:45–49`
- `context-flow/scripts/cf-pi-stop.sh:22–26`

Each carries an identical four-path glob that searches sibling and parent-level `pi-dispatch/` trees at two depths (flat and versioned layouts). Any change to the canonical install path must be replicated in all four. This is a maintenance hazard independent of which option is chosen.

---

## Record: run_in_background sub-agent behavior — KNOWN vs real UNKNOWN (F3)

`context-flow/agents/pi-driver.md:35` states the harness max is 600s; the Bash tool-timeout returns with no exit status when a call exceeds it, and the sub-agent regains control and must manually re-poll. This is the **KNOWN** mechanism: the sub-agent regains control on the Bash tool-timeout and must manually re-poll — established, confirmed, already the basis of the current poll loop.

The real **UNKNOWN** is distinct: whether the harness auto-re-invokes a sub-agent on the background process's exit. `pi-driver.md:35` is a weak-negative prior — the sub-agent is NOT auto-woken; it must re-poll explicitly. The auto-re-invoke-on-background-exit behavior is the open question / untested unknown that F3 must resolve.

Native `run_in_background` + auto-re-invoke-on-exit is **PROVEN** for the main command agent. Evidence: `spiral/scripts/wait-decision.sh` is explicitly documented as "Run this with the Bash tool's `run_in_background`" (line 6), and `spiral/commands/spiral.md:143–148` instructs the main spiral agent to launch it that way, with the harness re-invoking the agent on exit.

For a restricted sub-agent such as `pi-driver` (tools: Bash, Read only), the auto-re-invoke-on-background-exit is an open unknown. This has not been tested. The `run_in_background` option must not be chosen until this is empirically demonstrated in a controlled sub-agent context.

---

## F3 Empirical Result

### Procedure

Three arms were run, with markers written to `.spiral/f3-probe/` (throwaway fixtures). The subject (ARM-SUBJECT) was a restricted sub-agent (Bash+Read only). MAIN observed all outcomes — F3 is observable only by MAIN about the sub-agent, not self-observed by the sub-agent, because a sub-agent cannot report on its own re-invocation after returning; this is a direct consequence of star topology (C2).

### ARM-SUBJECT — sub-agent + `run_in_background`

A restricted sub-agent (Bash+Read only) wrote `phase=launched`, launched `sleep 5 && echo phase=bg_exited` via Bash `run_in_background`, returned "LAUNCHED", and ended its turn. The bg task completed (`phase=bg_exited` at +9s) AFTER the sub-agent had already returned — proving the bg task ran to exit. Snapshot of `marker-after.txt` taken 8s after launch, past the 5s bg window:

```
phase=launched ts=1782018382
phase=bg_exited ts=1782018391
```

No `phase=reinvoked` line ever appeared for ARM-SUBJECT. The sub-agent was not re-invoked by the harness on the background process's exit.

### ARM-CONTROL — MAIN + `run_in_background`

MAIN wrote `phase=launched`, launched a REAL background command (`sleep 5 && echo phase=reinvoked`) via Bash `run_in_background`, ended its turn, and WAS genuinely re-invoked by the harness on the bg task's exit (task-notification fired). The 13s gap between `launched` and `reinvoked` proves the background command (not a foreground echo) wrote the reinvoked line. `control2-marker.txt`:

```
phase=launched ts=1782019044
phase=reinvoked ts=1782019057
```

ARM-CONTROL reached `phase=reinvoked` — **control PASSED / rig valid**. The marker mechanism and MAIN re-invoke are both confirmed working. The asymmetry is unambiguous: MAIN is re-woken, the sub-agent is not.

> **Note:** An earlier turn-5 control block showing `ts=1782018435` twice (0s gap) was a FALSE control — both lines were written synchronously, not via background re-invoke. That block is VOID / superseded by the proper control above.

### ARM-TASK — Task-tool / Monitor wait from sub-agent

ARM-TASK was run: a sub-agent, within its single invocation, launched a background task and polled it to completion. Marker block from `task-marker.txt`:

```
phase=launched
phase=bg_done
phase=observed_within_invocation
```

ARM-TASK confirms **in-invocation polling, NOT re-wake**: a sub-agent cannot be re-woken after returning, but CAN poll within its single invocation — the `cf-pi-run.sh` pi-driver poll-loop pattern. The demonstrated single-shot lifecycle (ARM-SUBJECT) shows a returned sub-agent cannot be re-woken by ANY external mechanism — the constraint is the lifecycle, not the signaling channel. What works is a sub-agent polling WITHIN its single invocation (Monitor or a poll loop). This is the working alternative to re-wake.

### Outcome enumeration

- **(a) re-invoke on bg exit (ARM-SUBJECT):** not-observed — no `phase=reinvoked` appeared for the sub-agent arm despite `phase=bg_exited` confirming the bg task ran to completion.
- **(b) no re-invoke (ARM-SUBJECT):** observed — sub-agent returned after launching the bg task and was never re-invoked.
- **(c) Task-tool / Monitor re-wake from sub-agent (ARM-TASK):** OBSERVED — in-invocation polling (`phase=bg_done`, `phase=observed_within_invocation` confirmed), NOT re-wake; a sub-agent cannot be re-woken after returning but CAN poll within its single invocation; in-invocation polling is the viable alternative to re-wake.

**F3 RESULT: NO**

### Bonus finding

A sub-agent's `run_in_background` task outlives the sub-agent: `phase=bg_exited` was written after the sub-agent returned. Fire-and-forget works; collection-by-re-wake does not.

### C1 refinement

`BASH_MAX_TIMEOUT_MS` is user-configurable; a 10-minute absolute ceiling is believed but `cap unverified` — no official doc citation establishes an absolute 10-min maximum. Raising the setting beyond 600s may or may not dissolve the ceiling for ~35-min work; the cap's existence cannot be asserted without a docs reference. C1 is therefore "configurable, cap unverified" — a real practical wall for long Pi runs, but the precise bound is not confirmed from the env-vars docs alone.

The 600s working-ceiling is a separate, in-repo established fact: `context-flow/agents/pi-driver.md:35` states "harness max is 600s so request `timeout: 600000`." This in-repo ceiling is cited and kept regardless of whether a higher absolute cap exists.

### Consequent dispatch-shape decision

F3=NO selects **Recommendation step 4 ladder** (the F3-does-not-confirm branch). The target shape is MAIN-driven `run_in_background` + Monitor (the official long-running pattern: Bash `run_in_background: true` + the Monitor tool for reactive polling), because a sub-agent cannot hold a wait across re-invocation. The only way to avoid a poll loop entirely is to drive from MAIN — MAIN IS re-woken on bg exit, and can use Monitor for reactive collection. Keeping a sub-agent driver means keeping an in-invocation poll loop (modernizable to native `run_in_background` + Monitor within the invocation, but not eliminable as a polling structure).

---

## Recommendation

Ordered steps — each independently actionable, later steps may depend on earlier ones:

1. **Deduplicate the sibling-resolver (independent of all other choices).** The naive approach — extract the four-path glob into a shared helper placed under `pi-dispatch/scripts/` — has a circularity: the shared helper under pi-dispatch cannot be sourced before the glob that finds pi-dispatch runs. Each consumer needs the glob to locate `pi-dispatch/` in the first place, so a helper inside that directory cannot be sourced prior to resolution. The resolution: each plugin keeps a tiny bootstrap glob (the minimal lookup, not the full four-path search), then sources the shared logic after pi-dispatch is located. This means duplication shrinks but NOT to zero — each consumer retains a small bootstrap entry point. The maintenance surface shrinks from four full copies of the glob to four minimal bootstrap stubs plus one canonical shared helper. This is a two-way door: purely internal, no external contract change, immediately corrects the 4× duplication hazard.

2. **Run the gating empirical test: does `run_in_background` re-invoke a restricted sub-agent?** Write a minimal sub-agent (Bash+Read only) that launches a 5s sleep with `run_in_background` and observe whether the harness re-invokes it on exit. This is the blocking unknown (F3). The `run_in_background` option cannot be chosen until this test passes — OWD-1 (collapsing `pi-driver`) is gated on this result.

3. **If F3 confirms sub-agent re-invoke: migrate cf to `run_in_background` + collapse `pi-driver`.** Replace the `cf-pi-dispatch.sh` + `cf-pi-poll.sh` + `cf-pi-stop.sh` adapter trio and the 70-round poll loop in `cf-pi-run.sh:228–303` with a single blocking `pi` invocation inside `pi-driver`, launched with `run_in_background`. Retain `write_outcome` in `cf-pi-run.sh:67–126` as the `outcome.md` interface — the post-completion distiller reads it on FAIL/NEEDS_REPLAN only. Keep the canonical `OUTPUT=/PID=/RUNDIR=` stdout contract frozen (OWD-2). This is a one-way door (OWD-1): flag for human approval before crossing.

4. **If F3 does NOT confirm sub-agent re-invoke: choose from this three-rung ladder (cheap first, larger second, MAIN-driven third).** (1) Cheap rung — status-quo tightened: keep the in-sub-agent poll loop as-is, shrink the ceiling (tighten the timeout and round count so the 70 × 30s exposure is reduced). This requires no architectural change and is immediately actionable. (2) Larger rung — main-driven fanout (separate initiative, not a drop-in): relocate the fan-out point to MAIN and adopt synchronous blocking `pi` calls fanned out from the main orchestrator, one per sub-agent. This is a separate initiative requiring coordinated rewrites across all three plugins (see `subagent-fanout` section above for the star-topology constraint). Do not conflate these two rungs — the larger rung is not a symmetric alternative to the smaller; it is an unscoped architecture change. (3) MAIN-driven `run_in_background` + Monitor — the official long-running pattern: drive dispatch from MAIN using Bash `run_in_background: true` and the Monitor tool for reactive polling/collection. Viable because MAIN re-invoke IS proven (ARM-CONTROL), even though sub-agent re-invoke is not. This eliminates the in-sub-agent poll loop entirely by keeping the wait at the MAIN level; it is the F3=NO path to background dispatch without a hand-rolled poll loop. Requires relocating the orchestration point to MAIN (same prerequisite as rung 2, but lighter — no sub-agent fanout rewrite needed if Pi shards run sequentially).

5. **Regardless of option chosen: freeze the canonical stdout contract `OUTPUT=/PID=/RUNDIR=` (OWD-2).** Any consumer that parses this format must be enumerated before any change to `pi-dispatch.sh`'s stdout format. Changing this contract is a separate one-way door that requires coordinated migration of all three plugins.
