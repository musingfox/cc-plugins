# Phase 3: Implement

Read from `commands/cf.md` before running any §3.x step, and again after context compaction. The `§3.x` numbers cited in cf.md and in the other docs are the sections below.

State to the human upfront: `Phase 3: parallel-sharded fan-out on <N> contract(s), built by <cf:implement | OMP ($PI_DESC)> per CF_IMPLEMENTER. Parent branch cf/$CF_SLUG; per-shard branches cf/$CF_SLUG-shard-<id>.`

Phase 3 splits the contract set by file-touch graph and builds one shard per connected component. On the default builder each shard is a background `cf:implement` agent bracketed by `cf-pi-run.sh --prepare-only` and `--gates-only` (§3.2); on OMP it is one background Bash that runs `cf-pi-run.sh` for every shard (§3.6). The gates live inside that script; you only fan out, collect, and route. "Design §N" below means section N of `${CLAUDE_PLUGIN_ROOT}/docs/parallel-sharded-design.md`.

**Token discipline (design §7), non-negotiable**: read ONLY each shard's paths-only `outcome.md` plus bounded peeks (`Read(file, limit=…)`, `jq '.field'`, `head`/`tail -N`, `sed -n` section slices). NEVER read `report.md`, `contracts.json`, `escalate.md`, briefs, postmortems, JSONL, or test logs — background-task stdout stays in the task's own output file (`run.out` on OMP; of `gates.out`, only its last line).

### 3.0 Parent worktree setup (idempotent)

Before sharding, materialize the parent worktree that all shard branches will be forked from and later merged into:

```bash
. "$SESSION/env.sh"
"$SCRIPTS/cf-pi-worktree.sh" "$SESSION" >/dev/null
. "$SESSION/env.sh"                          # picks up REPO_ROOT, BASE_BRANCH, BASE_HEAD, WORK
```

After this, `$WORK` is a git worktree on `cf/$CF_SLUG` forked from the user's HEAD at flow start. Per-shard branches (`cf/$CF_SLUG-shard-A`, `-B`, …) are created from this parent inside `cf-pi-run.sh`; the integration gate lands the same tree here as linear history. The user's host working tree is never touched during implement. After Phase 4 PASS, the parent branch is rebased onto the latest `$BASE_BRANCH`.

If `$REPO_ROOT` is empty (host is non-git): `$WORK` is a scratch directory, and the flow cannot pass the integration gate — `cf-pi-integrate.sh` and `cf-pi-rollback.sh` both refuse a non-git flow without writing a result file. Tell the human before Phase 3 that the flow needs a git repo to deliver.

### 3.1 Shard

Build the file-touch graph from `contracts.json` and emit one shard per connected component:

```bash
"$SCRIPTS/cf-pi-shard.sh" "$SESSION"
FAN_OUT=$(jq '.fan_out_count' "$SESSION/shards.json")
SHARD_IDS=$(jq -r '.groups | keys[]' "$SESSION/shards.json")
```

`shards.json` carries `{fan_out_count, groups: {<id>: {shard_id, contracts:[…], files:[…], depends_on:[…]}}}` and seeds `$SESSION/shards/<id>/env.sh` per shard. `depends_on` (shard ids whose contract interfaces this shard consumes, derived from contract-level `depends`) drives the wave rule in §3.2. You read only those two scalars / id list — never the full groups payload. Also assemble the brief inputs once (shared across all shards):

- `GOAL_ONELINE` — derived from `$SESSION/goal.md` (one sentence).
- `CONSTRAINTS` — `sed -n '/^## Constraints/,/^## Key Files/p' "$SESSION/research.md"`, boiled to short lines.
- `TEST_RUNNER` — full-suite command, from `$SESSION/plan.md` Implementation Plan §Test
  Runners, or one-shot `AskUserQuestion` with language default. Used at the integration
  gate and again at the Phase 4 delivery check (`post-pass-protocol.md` § Post-PASS rebase + delivery) — never at a shard gate.
  **Record it once, immediately, into the session env so the later gates cannot lose it**
  (every command you run is a fresh shell; a variable you hold in context does not
  survive into one, and a gate that receives nothing either refuses or silently reports
  the tree as unverified):

  ```bash
  printf 'TEST_RUNNER=%s\n' "$(printf '%q' '<resolved full-suite command>')" >> "$SESSION/env.sh"
  ```

  Both gates take it as an argument first and fall back to this recorded value.
- `SHARD_TEST_RUNNER` — hermetic subset for per-shard gates, from the same §Test Runners.
  Must not need live services / shared ports / external daemons (parallel shards each run
  it in their own worktree — a shared resource makes every first run collide and fail).
  Missing from plan → fall back to `TEST_RUNNER` and warn the human in one line.
  Record it the same way: `--gates-only` (§3.2) runs its shard gates in a fresh shell, and so does the OMP round (§3.6).

  ```bash
  printf 'SHARD_TEST_RUNNER=%s\n' "$(printf '%q' '<resolved shard command>')" >> "$SESSION/env.sh"
  ```

### 3.2 Fan-out

**Wave rule.** A shard is READY when every id in its `depends_on` already has a PASS checkpoint (`jq -r '.checkpoints | keys[]' "$SESSION/dispatch-state.json"`); shards with `depends_on: []` are READY immediately. Launch ONLY the READY shards — a dependent shard dispatched early forks a base without its prerequisites' interfaces and `cf-pi-run.sh` refuses it (`FAIL prereq-missing`). Dependent shards launch as the next wave from §3.4 routing; `cf-pi-run.sh` merges their prerequisites' checkpoints into their worktree base automatically.

This is the Claude round, the default builder. With `CF_IMPLEMENTER=omp` recorded in `$SESSION/env.sh`, run the OMP round in §3.6 instead. A round runs in this order; the gates decide whether each shard's work and report stand, so a builder's reply is never read for its verdict:

1. **Snapshot the host.** Write `$SESSION/host-snapshot`, the host HEAD and a hash of its porcelain status, so step 6 can tell whether anything touched the host repo:

   ```bash
   . "$SESSION/env.sh"
   { git -C "${REPO_ROOT:-.}" rev-parse HEAD; git -C "${REPO_ROOT:-.}" status --porcelain | shasum -a 256; } > "$SESSION/host-snapshot"
   ```

2. **Prepare, sequentially.** One foreground Bash, run from the host repo root (the shard worktree forks from the repository of the current directory), runs `--prepare-only` for each READY shard in turn. It clears the shard's previous round and reuses its worktree. A shard whose prepare writes an `outcome.md` (`FAIL test-runner-missing`, `prereq-missing`, `prereq-merge-conflict`, `brief-assembly`, or `outcome-missing`) is done for the round; every other shard is logged as dispatched:

   ```bash
   . "$SESSION/env.sh"
   cd "${REPO_ROOT:-.}"
   for id in A B; do                     # the READY ids
     "$SCRIPTS/cf-pi-run.sh" --prepare-only "$SESSION/shards/$id" '<one-sentence goal>' '<short constraints>' "$SHARD_TEST_RUNNER" > "$SESSION/shards/$id/prepare.out" 2>&1
     if [ -s "$SESSION/shards/$id/outcome.md" ]; then echo "$id prepare-failed"; else echo "$id dispatched $(date +%s)" >> "$SESSION/claude-dispatch.log"; fi
   done
   ```

3. **Dispatch, in one message.** One `Agent` per prepared shard, with no `name:`, so they run as parallel background subagents. The prompt carries only the brief path, `WORK_DIR`, the `Report path:`, the escalate path and the `cd` rule:

   ```
   Agent(
     subagent_type: "cf:implement",
     prompt: "
       Brief: $SESSION/shards/A/implement-brief.md
       WORK_DIR: $SESSION/shards/A/work
       Report path: $SESSION/shards/A/implement-report.md
       Escalate path: $SESSION/shards/A/escalate.md
       Start every Bash command with `cd $SESSION/shards/A/work &&`; write nowhere else.
     "
   )
   ... (one Agent per prepared id)
   ```

   Dispatch at most 20 per message and the rest in the next batch once those return: the 21st concurrent subagent fails with `Concurrent subagent limit reached`.

4. **Gate each return.** When an agent returns, run `--gates-only` for that shard in the foreground, whatever the reply says — the gates decide. Act on nothing else in the reply, except a Claude usage limit shown there: that goes to §3.6, not to the gates.

   ```
   Bash(timeout: 600000, command:
     ". $SESSION/env.sh && echo \"A returned $(date +%s)\" >> $SESSION/claude-dispatch.log && $SCRIPTS/cf-pi-run.sh --gates-only $SESSION/shards/A '<one-sentence goal>' '<short constraints>' \"$SHARD_TEST_RUNNER\" > $SESSION/shards/A/gates.out 2>&1")
   ```

   The gates exit 1, 2 or 3 for a FAIL, NEEDS_REPLAN or REBRIEF, which the harness shows as a tool error; that is expected. Route in step 5 on `outcome.md` and the last line of `gates.out`, not the exit code. Always run it in the foreground; never start it as a background task.

   If the Bash result says `was moved to the background` (the 10-minute timeout was hit), the gate is still running and keeps running: do not re-run it. End your turn, and on that task's completion notification read the shard's `outcome.md` and the last line of `gates.out` as in step 5. This wait is not counted against the retry budget.

5. **Read each gates return.** A non-empty `$SESSION/shards/<id>/outcome.md` → the shard is done. Otherwise, if the last line of `gates.out` is `REBRIEF <kind> <path>` → dispatch a fresh `cf:implement` with the same prompt plus a `Re-brief: <path>` line, then step 4 again. Neither → treat the shard as `FAIL outcome-missing`.

6. **Close the round.** When every dispatched shard has an `outcome.md`, compare `$SESSION/host-snapshot` against the host's HEAD and porcelain hash now. On a mismatch, tell the human what moved; never fail the round on it. Continue at §3.3.

### 3.3 Collect

Wait for ALL shards of the current wave before routing (round-collection rule, design §4) so NEEDS_REPLAN coalesces into a single Plan invocation. End your turn after fan-out. On a Claude round, each agent return is the collection event: gate that shard in that turn (§3.2 step 4), and continue when every dispatched shard has a non-empty `$SESSION/shards/<id>/outcome.md`. A Claude round arms no Monitor. On an OMP round, the one background completion (§3.6) means every shard of the wave has finished: read the outcomes and continue. A shard with no non-empty `outcome.md` at that point is `FAIL outcome-missing`; do not end the turn again to wait for it.

Once all are done, read each shard's status from its paths-only outcome (never the report/diff/JSONL it points to):

```bash
for id in $SHARD_IDS; do
  printf '%s=' "$id"
  sed -n '/^## Status/{n;p;q;}' "$SESSION/shards/$id/outcome.md"   # PASS|FAIL|NEEDS_REPLAN
done
```

`outcome.md` carries `## Status`, `## Reason`, `## Cause` (one bounded line extracted from the artifact matching the failure), `## Tests` (the runner's own count line, `unparsed` when it printed none, or `not-run` when the shard failed before gate 3 or its runner stalled — an exit code alone cannot tell a green suite from one that skipped everything, so read this before believing a PASS), `## Run`, `## Survived contracts`, `## Affected contracts`, `## Artifacts` — all paths-only besides Cause; pull `## Survived contracts` / `## Affected contracts` only when routing needs them. If a shard's outcome.md is missing or empty (its background task crashed before writing it), treat that shard as `FAIL` with reason `outcome-missing`.

**Failure transparency — mandatory.** For every non-PASS shard, before routing, read its `## Reason` + `## Cause` and tell the human in one sentence per shard WHY it failed (e.g. `B: NEEDS_REPLAN — test-fail-persistent: "AssertionError: expected 200, got 404"`). Never report a bare status. If Cause is `-`, read `tail -20` of the postmortem path from `## Artifacts` and summarize; name the postmortem path so the human can dig deeper.

Persist round results to disk (you never hold the JSON in context):

```bash
"$SCRIPTS/cf-pi-record-round.sh" "$SESSION" \
    --round "$ROUND" --result "A=PASS" --result "B=NEEDS_REPLAN" --result "C=FAIL"
# Updates $SESSION/dispatch-state.json (current round only) and appends prior
# round to $SESSION/dispatch-state-archive.jsonl (never read by you during the flow).
```

Bounded reads on state for routing:

```bash
jq -r '.results_latest | to_entries[] | "\(.key)=\(.value)"' "$SESSION/dispatch-state.json"
jq -r '.replan_count["<contract>"] // 0'                     "$SESSION/dispatch-state.json"
jq -r '.rollback_count'                                       "$SESSION/dispatch-state.json"
```

### 3.4 Route by status set

Precedence within one round: **FAIL retries are resolved first, then NEEDS_REPLAN is coalesced, then newly-READY dependent shards dispatch as the next wave (back to §3.2), and only when EVERY shard in `shards.json` is PASS does integration trigger.** (FAIL is an infra signal; resolving it may change the NEEDS_REPLAN set.)

#### Any FAIL

**These reasons are exempt from the re-launch: `test-stalled`, `probe-stalled`, `test-runner-missing`, `QUOTA` and `QUOTA-WINDOW`.** `test-stalled` and `probe-stalled` both mean something never returned within its deadline — the shard already burned `CF_TEST_DEADLINE_S` (or `PI_PROBE_DEADLINE_S`) once, and re-launching with the same inputs buys exactly the same wait a second time. Same argument as `INT_STATUS=TEST_STALLED` below: this is infrastructure, not a contract failure. Show the human the reason line and `$SESSION/shards/<id>/outcome.md`, and ask whether to raise the deadline and re-run that shard or to investigate what hangs. Do not count these against the retry budget.

**`test-runner-missing` is refused before anything runs**, so a re-launch with the same blank runner is refused the same way. Show the human the reason line and the outcome's Cause, and ask for the shard test runner; once it is recorded as `SHARD_TEST_RUNNER` in `$SESSION/env.sh` (§3.1), re-run that shard. Do not count it against the retry budget.

**`QUOTA` and `QUOTA-WINDOW` are never re-launched either.** The shard hit the provider's quota wall — `QUOTA` is balance or plan, which only paying resets; `QUOTA-WINDOW` is a rolling window that clears on its own in hours — and a re-launch on the same `$PI_DISPATCH_CMD` pays for the same wall a second time. Siblings of the same batch end with the same tag as their Reason and `sibling-abort` in Affected. Show the human the reason line and each affected shard's `outcome.md`, and ask via `AskUserQuestion` whether to route those shards back to the Claude builder — append `CF_IMPLEMENTER=claude` to `$SESSION/env.sh` and run them as a §3.2 round — or to stop so the human can start a new flow with a different `$PI_DISPATCH_CMD`. When any shard in the round ended `QUOTA` or `QUOTA-WINDOW`, do not re-launch that round's other FAIL shards on the same `$PI_DISPATCH_CMD` either: a re-launch starts after the wall was recorded, reads it as stale, and pays for it again. Route them the same way as the quota shard: back to the Claude builder as a §3.2 round, or a stop to re-route. Do not count these against the retry budget.

Otherwise a FAIL is an infrastructure failure on either builder: a prepare error (`prereq-missing`, `prereq-merge-conflict`, `brief-assembly`), a report still malformed after its one re-brief, a runner error, a revert-gate error, or a missing outcome; on OMP also a probe error, a broken dispatch, and a stall after the in-script retry. Re-launch that shard once on the flow's current builder. On Claude, the re-launch is §3.2 steps 2–5 for that shard: `--prepare-only` clears the previous round's outcome/report/escalate/diff and reuses the worktree, so the shard's session directory needs no cleanup from you. On OMP it is one background Bash in one message for the failed shards only, in the §3.6 single-task form restricted to their ids (`run_in_background: true`, `timeout: 7200000`); it clears the same files itself.

If the second attempt still returns FAIL, escalate via `AskUserQuestion` (peek context with `head -80 "$SESSION/shards/<id>/escalate.md"` if present):

- Options: `accept-partial` (drop failed shard, route remaining via §3.4 below) / `abort-flow` / `attempt-third-retry` / `rerun-on-omp` (a Claude shard only, and only when `PI_AVAILABLE=1`: record `CF_IMPLEMENTER=omp` per §3.6 and run it as an OMP round).

Per-shard, per-round FAIL retry budget = 1 (design §6).

#### All PASS (after FAIL resolution)

"All" means every shard in `shards.json`, not just this wave — if undispatched dependent shards remain, they are now READY (their prerequisites just passed): dispatch them as the next wave (§3.2) instead. Only with no shard left un-PASS, run the integration gate — merge all PASS shard branches into `cf/$CF_SLUG-integrated`, run the full test suite, and land the result on `cf/$CF_SLUG` as linear history:

```bash
. "$SESSION/env.sh"
rm -f "$SESSION/integration-result.json"
"$SCRIPTS/cf-pi-integrate.sh" "$SESSION" "$TEST_RUNNER"
INT_STATUS=$(jq -r '.status' "$SESSION/integration-result.json" 2>/dev/null || echo MISSING)
```

- `INT_STATUS=MISSING` → the gate refused before doing anything and left no result file (exit 4): a blank runner, a non-git flow, or a missing `env.sh` or dispatch state. Nothing was merged or landed. Show the human the script's stderr line and escalate; never proceed to Phase 4.

- `INT_STATUS=PASS` → read `jq -r '.test_counts' "$SESSION/integration-result.json"` before believing it, for the reason given under `## Tests` in §3.3; this is the green that authorizes delivery. `unparsed` means the runner printed no count line — say so to the human in one line rather than passing over it. Then proceed to Phase 4, which captures `$SESSION/implement.diff`.
- `INT_STATUS=NEEDS_REPLAN` → integration gate auto-injects NEEDS_REPLAN for the affected contracts (`jq -r '.affected_contracts[]' "$SESSION/integration-result.json"`). Funnel into the partial-replan path below as if they came from shard outcomes.
- `INT_STATUS=TEST_STALLED` → the integration suite outran `CF_TEST_DEADLINE_S` and was killed, so nothing was attributed and nothing was landed. This is infrastructure, not a contract failure: never funnel it into partial-replan. Show the human `.test_log` and `.deadline_s` and ask whether to raise the deadline and re-run the gate, or to investigate the hanging test.
- `INT_STATUS=FAIL` → a shard merge conflicted on the integration branch (`.reason` is `merge_conflict`). File-graph sharding should make this impossible, so the shard plan and the branches disagree. Escalate with `jq -r '.offending_shard, .offending_branch' "$SESSION/integration-result.json"` named — do not resolve the conflict by hand, and never proceed to Phase 4.
- `INT_STATUS=LINEARIZE_CONFLICT` → the commits could not be replayed onto `cf/$CF_SLUG` as linear history, or the parent worktree was refused before any rewrite; the passing tree remains on `.integration_branch` and the parent sits at `.parent_prior_tip`. Read `jq -r '.reason, .offending_shard, .offending_commit' "$SESSION/integration-result.json"` and escalate with the cause named — never proceed to Phase 4 on this status. Reasons:
  - `parent_missing` — `$SESSION/work` is absent or not a git worktree. Nothing was written; the gate can be rerun once the worktree exists on `cf/$CF_SLUG`.
  - `parent_wrong_branch` — `$SESSION/work` is checked out on a branch other than `cf/$CF_SLUG`. Nothing was written; rerun once it is back on `cf/$CF_SLUG`.
  - `parent_dirty` — `$SESSION/work` has uncommitted changes. Nothing was written; show the human `git -C "$SESSION/work" status --porcelain` and rerun once it is clean.
  - `dependency_cycle` — `shards.json` `depends_on` is cyclic. Nothing was written; the plan needs repair before the gate can land anything.
  - `no_shards_merged` — every checkpoint shard was skipped (missing `shards/<id>/env.sh` or a deleted shard branch). Nothing was written; dispatch state and branches disagree.
  - `cherry_pick_conflict` — `.offending_commit` from `.offending_shard` did not apply on top of the earlier shards; the parent was restored to `.parent_prior_tip`. Hand both values to the human — do not resolve the conflict by hand.
  - `tree_mismatch` — the replay completed but the parent tree differs from `.integration_branch` (typically a wrong `shards/<id>/prereq-refs`); the parent was restored to `.parent_prior_tip`.

#### Any NEEDS_REPLAN (after FAIL resolution)

Coalesce all NEEDS_REPLAN this round (worker-initiated escalate.md, persistent-test-fail, undeclared_file_touched, tests-green-on-revert, AND any integration-injected affected_contracts) into a single Plan partial-replan invocation. Already-PASS contracts (from this and prior rounds) are preserved — their checkpoints stay on shard branches.

`tests-green-on-revert` comes from the revert gate: the contracts it lists under `## Affected contracts` have tests that still pass with the shard's implementation put back to `$BASE_HEAD`, so those tests prove nothing. Say so for each of them in the request below, so Plan gives the contract a test case that fails without its implementation.

Build the Partial Replan Request block per `${CLAUDE_PLUGIN_ROOT}/agents/plan.md` §Partial Replan Request, then dispatch:

```
Agent(
  subagent_type: "cf:plan",
  prompt: "
    Report path: $SESSION/plan-replan-${ROUND}.md
    Contracts path: $SESSION/contracts.json

    ## Partial Replan Request
    - Affected contracts: <coalesced list>
    - Preserve interfaces: <already-PASS contract names>
    - Escalations: <paths to per-shard escalate.md, if any>
    - Base contracts: $SESSION/contracts.json
    - Base plan: $SESSION/plan.md
    - Revision path: $SESSION/contracts-revision-${ROUND}.json
    - Status path: $SESSION/replan-status-${ROUND}.json

    Mode: partial-replan. Return per your partial-replan reply shape.
  "
)
```

Read only the reply's first Summary bullet to branch:

- `Status: PARTIAL-REPLAN (...)` → apply the revision and re-fan-out only affected shards:
  ```bash
  "$SCRIPTS/cf-pi-merge-revision.sh" "$SESSION" "$SESSION/contracts-revision-${ROUND}.json"
  "$SCRIPTS/cf-pi-shard.sh"          "$SESSION"   # re-emits shards.json and env; each shard keeps its worktree base
  # then re-fan-out only the affected shards on the flow's builder: the §3.2 Claude round (steps 2–5), or one background cf-pi-run.sh per affected shard id in a single message (§3.6)
  ```
- `Status: REPLAN_REQUIRES_ROLLBACK (...)` → Plan declines partial-replan; the preserved interface itself is the problem. Bounded read of the rollback list:
  ```bash
  jq -r '.rollback_contracts[]' "$SESSION/replan-status-${ROUND}.json"
  ROLLBACK_COUNT=$(jq -r '(.rollback_count | numbers) // 0' "$SESSION/dispatch-state.json")
  ```
  If `$ROLLBACK_COUNT < 2`: run `"$SCRIPTS/cf-pi-rollback.sh" "$SESSION" <contract...>` with the listed contract names. It maps each contract to its shard through `shards.json` (exit 5 when one maps to no shard, exit 6 when `dispatch-state.json` is not a JSON object; either way nothing changed: escalate), removes those shards' worktrees and branches (each branch head stays reachable at `refs/cf-rollback/<flow>/shard-<id>-<n>` until the success-path cleanup in cf.md's "Scaffolding leaves no trace" deletes it; the escalation path keeps it), drops their `.checkpoints` entries from `dispatch-state.json` (the checkpoint tags stay), and increments the per-flow integer `rollback_count` once, then dispatch a full Plan re-invocation (no partial-replan flag) and return to §3.1. If `$ROLLBACK_COUNT >= 2`: escalate (see Budget guards).

### 3.5 Budget guards

After each round, before routing the next dispatch, check budgets via bounded `jq`:

```bash
jq -r '.replan_count | to_entries[] | select(.value >= 3) | .key' "$SESSION/dispatch-state.json"
jq -r 'select(((.rollback_count | numbers) // 0) >= 3) | "rollback-exhausted"' "$SESSION/dispatch-state.json"
```

If either fires, escalate to the user via `AskUserQuestion`:

- Context: name the over-budget contract(s) or `rollback-exhausted` and the round number. Optionally peek `head -80 "$SESSION/shards/<latest-failed>/escalate.md"` if it exists.
- Options: `revise-goal` (loop back to Phase 1 with new framing) / `accept-partial` (ship PASS contracts only, drop the over-budget ones) / `abort-flow` / `other`.

Replan budget = 2 attempts per contract (third NEEDS_REPLAN escalates). Rollback budget = 2 cycles per flow (third escalates). FAIL retry budget = 1 per shard per round (handled in §3.4 Any FAIL).

### 3.6 OMP overflow (`CF_IMPLEMENTER=omp`): one background Bash per wave, `QUOTA` outcomes

OMP builds a round only when `CF_IMPLEMENTER=omp` is recorded in `$SESSION/env.sh` and `PI_AVAILABLE=1`. The full per-shard lifecycle (worktree → brief → probe → dispatch → poll → gates → outcome) lives inside `cf-pi-run.sh`; you only fan out, collect, and route.

**When to offer OMP.** You suggest it at exactly three moments, and only when `PI_AVAILABLE=1`:

1. A Claude usage limit shows in a `cf:implement` reply (§3.2 step 4), or the weekly limit is spent.
2. A shard's second FAIL on Claude (§3.4 Any FAIL).
3. The human says they raised their quota, for example that the weekly limit was lifted.

Never ask at flow start. With `PI_AVAILABLE=0` never offer OMP at all: pi set up mid-flow applies to the next flow. A switch appends `CF_IMPLEMENTER=omp` to `$SESSION/env.sh` and takes effect from the next wave or re-run; rounds already built stay as they are.

On a usage-limit reply, stop this round's Claude dispatches and re-briefs, then ask via `AskUserQuestion`: switch these shards to OMP (offered only with `PI_AVAILABLE=1`), wait for the reset and re-dispatch them, or stop. This is not counted against the retry budget.

OMP builds with the model in `$PI_DISPATCH_CMD`. Keep the reviewer at or above that model (dispatch doctrine: reviewer ≥ builder); nothing enforces it for you.

**No pre-dispatch quota gate.** There is none, deliberately: there is no provider-side headroom signal to read (`pi auth check` reports readiness, not remaining balance, and is blind to package-provided providers). Exhaustion is caught reactively — `cf-pi-run.sh`'s poll classifies it as `QUOTA` (balance or plan, which only paying resets) or `QUOTA-WINDOW` (a rolling window that clears on its own in hours), and one worker hitting the wall aborts its whole batch rather than letting every sibling pay for the same wall: the shard that hits it records the wall for the flow, and every sibling `cf-pi-run.sh` stops its own worker from that record with the same tag. On that outcome (§3.4 Any FAIL), route those shards back to the Claude builder (§3.2) or re-run later as a new flow with a different `$PI_DISPATCH_CMD`.

Launch the READY shards in PARALLEL as ONE background task: a single `Bash` with `run_in_background: true` and `timeout: 7200000`, in a **single message**. It starts one `cf-pi-run.sh` per READY shard, waits for all of them, and exits 0; each shard writes its own output to `run.out`:

```
Bash(run_in_background: true, timeout: 7200000, command:
  ". $SESSION/env.sh || exit 1
   $SCRIPTS/cf-pi-run.sh $SESSION/shards/A '<one-sentence goal>' '<short constraints>' \"$SHARD_TEST_RUNNER\" > $SESSION/shards/A/run.out 2>&1 &
   $SCRIPTS/cf-pi-run.sh $SESSION/shards/B '<one-sentence goal>' '<short constraints>' \"$SHARD_TEST_RUNNER\" > $SESSION/shards/B/run.out 2>&1 &
   ... (one line per READY id)
   wait
   exit 0")
```

The 4 positionals are `SHARD_SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER` — pass the resolved `SHARD_TEST_RUNNER` (the full suite belongs to the integration gate). Do NOT pass research output, decision alternatives, plan prose, or rejected approaches; each shard derives everything else from its `SHARD_SESSION/env.sh`. A foreground Bash is capped at 10 minutes, so the background task carries an explicit `timeout: 7200000` (two hours), and that timeout stops every shard of the wave together. A shard that exits 1, 2 or 3 does not fail the task; a shard that dies before writing its outcome gets `FAIL outcome-missing` from its own exit trap, and each shard writes `$SESSION/shards/<id>/outcome.md` on completion.

**Progress** — the round arms no progress monitor. The human checks on demand with one line, printed right after fan-out:

- `` Watch progress: bash $SCRIPTS/cf-pi-status.sh $SESSION ``
- On a `STALL` line in that status output, do not intervene — `cf-pi-run.sh` handles kill/retry itself; the line is for awareness.
