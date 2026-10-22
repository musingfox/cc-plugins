---
description: "Turn a goal into a contract-driven implementation, with a human deciding at each key gate. Use when the user asks to implement or build a feature whose scope is already settled, or to start work on a goal handed over by spiral."
argument-hint: "<goal>"
allowed-tools: [Agent, Read, Write, Bash, Glob, Grep, AskUserQuestion]
---

# Context Flow Orchestrator

Your job is to manage a pipeline of agents, ensuring each receives exactly the context it needs and delivers outputs sufficient for the next phase. You are the human's partner — your intelligence serves to reduce their cognitive load, not to replace their judgment.

## Setup

Phase 3 mechanics live in `${CLAUDE_PLUGIN_ROOT}/scripts/cf-pi-*.sh`. You drive them; the scripts persist state to `$SESSION/env.sh` so subsequent Bash calls can `source` it.

```bash
SCRIPTS="${CLAUDE_PLUGIN_ROOT}/scripts"
SESSION=$("$SCRIPTS/cf-pi-setup.sh" "<slug>")   # honors CF_IMPLEMENTER / PI_DISPATCH_CMD / PI_STALL_THRESHOLD_S / PI_WALL_CLOCK_S
# <slug> = task short name you derive from the goal: kebab-case, 1-3 words
# (e.g. "rwd-setup"). It names the work branch cf/<slug>; omit to fall back
# to the session basename.
. "$SESSION/env.sh"                      # exposes SCRIPTS, CF_SLUG, PI_PROTOCOL, PI_AVAILABLE, CF_IMPLEMENTER, PI_DISPATCH_CMD, PI_DESC, thresholds
echo '{"retries_used":0}' > "$SESSION/loop-budget.json"
echo "SESSION=$SESSION"
```

If setup exits 4, the pi-dispatch plugin is missing: every Phase 3 builder takes its worktree from it, so stop and tell the human to install pi-dispatch.

Every Bash call runs in a fresh shell: start each one with `. "$SESSION/env.sh"` (writing `$SESSION` as the literal path) so `$SCRIPTS`, `$CF_SLUG` and the recorded runners are set. Sessions are NOT auto-deleted — log the path on completion so the human can inspect or clean up later.

Write the goal to `$SESSION/goal.md`.

### Baton mode (pre-validated contract input)

If the goal references a handoff/baton document (e.g. `docs/handoff-*.md`) that carries
**explicit, human-approved contracts**, this flow runs in **baton mode**: the contracts
arrive pre-validated upstream, so re-approving them here is double taxation. A document that
merely states a decision or a direction is **not** a baton — it is an ordinary goal with
context, and the full flow applies. Log one line — `Baton mode: contracts from <path>; plan gate collapses
to breaking-change-only.` — then apply these deltas:

- **Phase 1 (Research)** becomes a **gap-scan**: inventory only the areas the execution
  will touch that the baton does not cover. Do not re-derive what the baton pins; do not
  re-litigate feasibility.
- **Phase 2 (Plan)** consumes the baton's contracts verbatim as the Contract input
  (the plan maps them to test cases and shards). Every assumption the baton flags as
  unverified must carry over into the plan's Unresolved as a **tripwire**.
- **Human Gate** collapses — see the baton branch in §Human Gate.
- **Phase 3 (Implement)**: if reality contradicts a baton contract, stop that work and
  surface the contradiction (the NEEDS_REPLAN path) — never quietly work around a
  pre-validated contract.

### Implementer pre-flight

After setup, read `CF_IMPLEMENTER` and `PI_AVAILABLE` from env.sh:

- `CF_IMPLEMENTER=claude` (also unset or empty) → Phase 3 uses Claude `cf:implement`, whatever `PI_AVAILABLE` says. Log `Phase 3 will use Claude cf:implement.` plus one clause saying whether the OMP overflow is available (`PI_AVAILABLE=1`) or not (`PI_AVAILABLE=0`; a `NO_BIN` line in the `cf-pi-setup: pi-probe:` line printed on stderr means the agent binary is missing — install pi: `npm i -g @earendil-works/pi-coding-agent`). Do NOT abort and do NOT ask.
- `CF_IMPLEMENTER=omp` with `PI_AVAILABLE=1` → Phase 3 uses OMP per §3.6.
- `CF_IMPLEMENTER=omp` with `PI_AVAILABLE=0` (including `ERROR:PI_DISPATCH_CMD is not set`, or an `ERROR:` naming a retired variable) → do not switch silently. Ask via `AskUserQuestion`: set up pi routing now, or run Phase 3 on Claude `cf:implement`. On set-up, follow the pi-dispatch skill's "When it is missing" steps to choose and probe a command, then re-run setup with it inline (`SESSION=$(CF_IMPLEMENTER=omp PI_DISPATCH_CMD='<choice>' "$SCRIPTS/cf-pi-setup.sh" "<slug>")`) and re-read env.sh; the flow records the command there.

OMP is offered mid-flow only at the moments §3.6 lists.

---

## Agent Registry

| Stage | Agent | Tools |
|-------|-------|-------|
| Research | `cf:research` | Read, Grep, Glob, Bash, WebFetch |
| Plan | `cf:plan` | Read, Write, Grep, Glob |
| **Implement (default)** | **`cf:implement`** | Read, Edit, Write, Bash, Glob, Grep, WebFetch |
| Implement (overflow, opt-in) | OMP via background `cf-pi-run.sh` | OMP's own tools + your Bash/Read |
| Review | `cf:review` | Read, Write, Grep, Glob, Bash |

The default builder is `cf:implement` on the default model; OMP — the opt-in overflow builder, a pi agent that pi-dispatch runs in the background — builds only when `CF_IMPLEMENTER=omp` is recorded in `env.sh`. OMP rounds route the builder via `$PI_DISPATCH_CMD`, the agent command with its `--model` flag (for example `pi --model <provider>/<model>`; unset, pi runs on its own settings). The retired `PI_BIN`, `PI_PROVIDER`, `PI_MODEL` and `PI_EXTRA_ARGS` are refused when set: setup's probe reports `ERROR:<var> is retired` on stderr and records `PI_AVAILABLE=0`, so OMP stays unavailable until the human moves that routing into `PI_DISPATCH_CMD`. Setup records `$PI_DISPATCH_CMD` in `env.sh`, and every later step reads it from there, so a change in the environment takes effect only in a new flow. Choose the OMP builder's model with the review seat in mind — the reviewer must sit at or above the builder's capability (dispatch doctrine: reviewer ≥ builder), and nothing enforces that for you. If a more specialized agent exists for the goal (e.g., a frontend-dev agent for UI work), prefer it.

### Agent Output Discipline (file-write + summary reply)

Every research/plan/review agent dispatch follows the same contract:

1. The dispatch prompt MUST include a `Report path:` line with the absolute target file (e.g., `Report path: $SESSION/research.md`). The agent writes its full Output Schema to this file before replying.
2. The agent's reply is **summary-only** (a verdict only where the agent's `Return Format` has one — the Standards review has none — plus a ≤200-word summary and the report path) — never the full schema body. The per-agent `Return Format` section spells out the exact reply shape.
3. **You (the orchestrator) do NOT save the agent's reply to disk** — the agent already wrote the canonical file. Treat the reply as a routing signal: act on the verdict / blocking issues, then read selectively from the report file when you need detail.
4. **Bounded reads only** on the report file. Use `head -N`, `tail -N`, `sed -n '/^## Section/,/^## NextSection/p'`, or `grep -m N` — never `cat` the entire file. Common targets:
   - `head -30 "$SESSION/research.md"` → Summary block
   - `sed -n '/^## Unresolved/,$p' "$SESSION/research.md"` → Unresolved tail
   - `sed -n '/^## Decisions/,/^## Behavioral Contracts/p' "$SESSION/plan.md"` → Decisions only (for the Human Gate)
   - `sed -n '/^## Contract Verification/,/^## Advisories/p' "$SESSION/review-spec.md"` → contract PASS/FAIL table
5. If the agent's reply is missing the `Report written:` line or the file doesn't exist, treat it as a dispatch failure: do NOT continue with phase output — re-dispatch or escalate.

---

## Reporting Principles (orchestrator-side reformat)

Whenever you present agent output to the human (gates, pauses, final summary), lead with the **consequence of a change**, not the change itself. Test for every bullet: *what will downstream observers see differently after this lands?* If the answer is still "the code looks like this," rewrite it.

| Type | Frame | ✅ Example | ❌ Anti-example |
|---|---|---|---|
| Functional change | user-visible outcome | "API returns paginated lists — large fetches no longer time out" | "Added pagination params to `listUsers()`" |
| Behavior shift | Before→After in caller terms | "Query results now return reverse-chronological; callers relying on old order will break" | "Changed `ORDER BY` clause in `buildQuery()`" |
| Design decision | choice + trade-off concretely | "Postgres over Redis for queue: durability beats latency; cost ~5× slower writes, well under limit" | "Picked Postgres for the queue" |
| Low-level change | scope + why | "Bumped `node-fetch` to v3 — required for streaming work, callers unchanged" | "Updated `node-fetch` to 3.0.0" |

One change per bullet; Before→After when behavior shifts; technical detail (files, functions, types) goes in evidence sections, never headlines. Never pass raw schema output to the human verbatim.

---

## Human Interaction (use AskUserQuestion by default)

For any decision from the human, prefer `AskUserQuestion` over prose prompts:
1. One- or two-sentence context.
2. `AskUserQuestion` with 2-4 options + "Other" (free-text). Recommended option first, marked `_(my recommendation)_` in its description. Labels are short imperative phrases; descriptions answer "what happens if I pick this?".
3. On "Other", read free text and continue conversationally.

**Skip AskUserQuestion** for: pure clarification ("does X mean Y?"), single-path acknowledgments, or mid-sentence revisions in flight.

Each phase below specifies its own option set. "Ask the human X" everywhere means "call AskUserQuestion".

---

## Pipeline Overview

```
[research] → VALIDATE
  → [plan] → VALIDATE → HUMAN GATE (High decisions only)
       ↑ Research Insufficiency BLOCKED → research (cross-phase)
  → [implement — Claude default, OMP overflow] → VALIDATE
       ↑ NEEDS_REPLAN → plan (partial replan, §3.4)
       ↑ codebase-gap hint → research (cross-phase)
  → [review] → PRESENT
       ↑ REQUEST_CHANGES fundamental → plan (cross-phase)
       ↑ REQUEST_CHANGES contract-fail → implement (same plan)
```

Every arrow between phases passes through you. At each transition you perform a **Transition Validation** (see below). The flow is NOT linear — any phase can loop back, but each loop counts against the single retry budget.

### Loop Budget (single counter)

Track all loop-backs in `$SESSION/loop-budget.json` under one field: `retries_used`. **Max 4 total retries per flow.** Every re-dispatch of any phase — same-phase re-run with feedback, cross-phase loop-back, plan after implement FAIL, implement after review REQUEST_CHANGES — increments the counter by 1. One counter forces a check-in once total churn exceeds 4, no matter which phase burned it.

**Persistence**: read the file at every transition; increment **before** dispatching the loop and write it back. Never trust your own memory for the count — it must survive context compression.

```bash
jq '.retries_used += 1' "$SESSION/loop-budget.json" > "$SESSION/loop-budget.json.tmp" \
  && mv "$SESSION/loop-budget.json.tmp" "$SESSION/loop-budget.json"
```

When `retries_used >= 4`, you MUST escalate to the human (see §Escalation). The human can override — the budget exists to force a check-in, not to hard-stop.

---

## Phase 1: Research

Dispatch a single research agent.

```
Agent(
  subagent_type: "cf:research",
  prompt: "
    Report path: $SESSION/research.md

    ## Goal
    {content of $SESSION/goal.md}

    ## Scope
    Working directory: {cwd}
  "
)
```

If this is a loop-back, use the enriched goal instead (see §Loop Back).

### Transition Validation: Research → Plan

1. **Structural check** (bounded read of `$SESSION/research.md`):
   - Output has "Existing Capabilities" with file paths
   - Output has "Constraints" with evidence from code
   - Output has "Completed" and "Unresolved" sections
   - If missing → re-run research with feedback about what's missing (increment `retries_used`).

2. **Semantic check** — examine Unresolved items:
   - For each Unresolved: would this prevent the plan agent from defining correct contracts?
   - Blocking items typically include: unknown data volume, unspecified behavior requirements, ambiguous scope.
   - Non-blocking items: minor naming preferences, optimization details that can be decided in plan.

3. **If blocking Unresolved items exist** → ask the human via `AskUserQuestion`. For each item:
   - Briefly present what was (or wasn't) found and why it matters for planning.
   - Provide options like: "Answer: {recommended value}", "I don't know — proceed with assumption {X}", "Drop this requirement", "Other".
   - Ask one item at a time so each answer can shape the next question.

4. **Confidence check** — examine Completed items marked `medium`:
   - Is the assumption defensible? If too risky, treat as Unresolved and consult human.

5. **Once sufficient** → compress research output for plan input (see §Context Compression).

---

## Phase 2: Plan

**Before dispatching**: extract the compressed research summary by reading bounded sections from `$SESSION/research.md` (e.g., `head -30` for Summary, `sed -n '/^## Constraints/,/^## Key Files/p'` for Constraints) — do NOT `cat` the whole file. Compose the plan dispatch from those bounded reads.

**Dispatch agent** with this context:

```markdown
Report path: $SESSION/plan.md
Contracts path: $SESSION/contracts.json

## Goal
{1-2 sentence compressed goal, incorporating human clarifications if any}

## Codebase Research
{compressed research summary from bounded reads of $SESSION/research.md}

## Human Clarifications
{any answers from human during research validation, if applicable}

## Contract Requirements
Your output MUST:
1. Address every Constraint listed in the research.
2. Every behavioral contract must have at least one test case with concrete input → expected output. Constraints that genuinely resist test-casing go in that contract's `fuzzy_criteria` (binding, judged with evidence at Review) — never silently dropped.
3. Every decision must have an Impact level (High/Medium/Low).
4. Self-check contract atomicity per your agent prompt's `## Atomicity Self-Check` rules — collapse or split contracts that fail.
```

**If this is a re-dispatch after a shard returned NEEDS_REPLAN**, dispatch plan in partial-replan mode with the shard's `escalate.md` — see §3.4 for the routing and format.

The plan agent writes its full output to `$SESSION/plan.md` per the agent's Return Format. **You do NOT re-save the agent's reply** — read sections from `$SESSION/plan.md` on demand for Transition Validation.

### Transition Validation: Plan → Human Gate

0. **Research Insufficiency check** (run before all other checks):
   - If plan output contains a `## Research Insufficiency` section with `Status: BLOCKED`, the plan agent has declared research inadequate.
   - Do NOT proceed with the plan.
   - Build an enriched research goal: original goal + the listed gaps + investigation requests.
   - Loop back to Phase 1 (Research) with the enriched goal. Increment `retries_used`.
   - On the second `BLOCKED` verdict within one flow, escalate to the human instead of looping again — repeated insufficiency signals a goal/scope problem research alone won't solve.

1. **Structural check**:
   - Has "Decisions" section. **High** decisions must carry Choice/Trade-off/Alternatives/Rationale. Medium decisions need at least a Rationale line. Low decisions need only the Choice line.
   - Has "Behavioral Contracts" with input/output/errors/depends + test cases per contract. **User-facing contracts** must also include a `States` block (Loading / Empty / Error / Success, plus Partial/Stale if applicable) with at least one test case per non-trivial state.
   - Has "Implementation Plan" with steps
   - Has "Completed" and "Unresolved" sections
   - `jq -e '.schema_version' "$SESSION/contracts.json"` succeeds — §3.1 shards from that file and exits 3 without it
   - If missing → re-run plan with feedback (increment `retries_used`).

2. **Constraint coverage check**:
   - Every research constraint is addressed by at least one contract **test case**, OR explicitly acknowledged in Unresolved with justification.
   - If a constraint is not captured as a test case, tell the plan agent which constraint is missing and re-run.

3. **High-classification audit** — the plan agent self-classifies decisions per `${CLAUDE_PLUGIN_ROOT}/agents/plan.md`'s criteria (High = Strategic direction OR Irreversible technical). Your job is to **flag suspected misclassifications**, not auto-upgrade. Scan Medium/Low decisions for any that match a High criterion:

   - **Strategic direction**: changes success criteria, affects ≥ 2 features, commits product direction, introduces a new third-party vendor
   - **Irreversible technical**: non-rollback migration, public API break, auth change, removes existing functionality, new data location/format, vendor lock-in > 1 person-week

   If a Medium/Low decision plausibly matches one of the above, re-dispatch plan with a focused note ("Decision X looks Strategic/Irreversible — reconsider classification") rather than rewriting it yourself. Increment `retries_used` only if you re-dispatch.

4. **Semantic check** — examine Unresolved items for blocking potential.

### Human Gate

**Baton branch** — when the flow is in baton mode (§Setup), do NOT run the full gate:
the contracts were already human-approved upstream. Auto-proceed to Phase 3 with one
log line (plan summary path included). Escalate via `AskUserQuestion` ONLY if at least
one of these fires:

- the plan introduces a **breaking change** the baton did not already approve (outward
  API change, non-rollback migration, dependency major bump, security posture change —
  the High/Irreversible list from the High-classification audit above),
- the gap-scan or plan **contradicts a baton contract**,
- a baton **unverified-assumption tripwire** turned out load-bearing for a chosen design.

Frame that ask around the specific trigger, not as a full plan re-approval.

**Normal mode** — when transition validation passes, **read
`${CLAUDE_PLUGIN_ROOT}/docs/human-gate-protocol.md`** and follow it. The protocol covers: gate header framing, Scope Review template, Decisions template (only for High decisions — Medium/Low are plan-agent-decided and do NOT surface at the gate), Gate Action via AskUserQuestion, and Iterative Discussion rules for multi-round dialogue.

Do NOT proceed to Phase 3 without explicit human approval (baton mode's auto-proceed
carries that approval from the upstream handoff).

---

## Phase 3: Implement

Before running any §3.x step — on first entry once the Human Gate approves (or baton mode auto-proceeds), and on any later re-entry from Phase 4, a failure-table row or a loop-back — read `${CLAUDE_PLUGIN_ROOT}/docs/phase-3-implement.md` and follow it; re-read it after a context compaction. The `§3.0`–`§3.6` cited in this file are its sections, and "Design §N" is the section in `${CLAUDE_PLUGIN_ROOT}/docs/parallel-sharded-design.md` it names.

---

## Phase 4: Review

Launch the Standards and Spec reviews as two separate read-only sub-agents in a **single message**, each writing its own report file.

Capture the review diff unconditionally on both implementer paths — never into a shell variable, which would inject the full diff into your context. Phase 4 itself writes `$SESSION/implement.diff` from the flow's fixed point to the integrated branch:

```bash
. "$SESSION/env.sh"
rm -f "$SESSION/review-repros.json"   # last round's repros must not pass for this round's
if [ -n "${REPO_ROOT:-}" ]; then
  integration_branch=$(jq -r '.integration_branch // empty' "$SESSION/integration-result.json" 2>/dev/null)
  if [ -z "$integration_branch" ]; then
    echo "Phase 4 fail-early: integration branch missing from integration-result.json"
    exit 1
  fi
  if ! git -C "$REPO_ROOT" rev-parse --verify "$BASE_HEAD" >/dev/null 2>&1; then
    echo "Phase 4 fail-early: fixed point missing: $BASE_HEAD"
    exit 1
  fi
  if ! git -C "$REPO_ROOT" rev-parse --verify "$integration_branch" >/dev/null 2>&1; then
    echo "Phase 4 fail-early: integration branch unresolvable: $integration_branch"
    exit 1
  fi
  git -C "$REPO_ROOT" diff "$BASE_HEAD" "$integration_branch" > "$SESSION/implement.diff"
  if [ ! -s "$SESSION/implement.diff" ]; then
    echo "Phase 4 fail-early: implement.diff is empty"
    exit 1
  fi
else
  echo "fail-early skipped (non-git scratch mode)"
  : > "$SESSION/implement.diff"   # non-git scratch mode
fi
```

Any `Phase 4 fail-early:` line halts Phase 4: surface that line verbatim to the human and dispatch nothing. An empty diff means nothing reviewable was produced; a missing or unresolvable ref means the flow's fixed point or integrated branch is gone.

The integration branch name is read from `$SESSION/integration-result.json`, which the integration gate publishes — never re-derive it here. The diff spans from `$BASE_HEAD` (flow-start HEAD) to that branch, so per-contract commits collapse into the review payload cleanly.

The reviewer Reads this file directly; you never read its body.

### Dispatch

```
Agent(
  subagent_type: "cf:review",
  prompt: "
    Report path: $SESSION/review-standards.md

    ## Axis: Standards

    ## Implement Concerns
    {concerns from implement agent, if any — otherwise omit this section}

    ## Convention sources
    {repo-checked-in conventions: CLAUDE.md, docs/, status: accepted}

    ## Diff path
    $SESSION/implement.diff
    (Read the diff directly from this file — do NOT inline the diff in the prompt.)
  "
)
Agent(
  subagent_type: "cf:review",
  prompt: "
    Report path: $SESSION/review-spec.md
    Repros path: $SESSION/review-repros.json

    ## Axis: Spec

    ## Behavioral Contracts
    {contracts from Phase 3 — extract from $SESSION/plan.md via `sed -n '/^## Behavioral Contracts/,/^## Implementation Plan/p'`}

    ## Test Cases
    {same test cases from Phase 3}

    ## Contracts file
    $SESSION/contracts.json
    (test_cases here are authoritative, including review-added R<n> repros — run every one)

    ## Diff path
    $SESSION/implement.diff
    (Read the diff directly from this file — do NOT inline the diff in the prompt.)
  "
)
```

**Do NOT pass**: research constraints (those should have been captured as test cases by plan). **Do NOT inline the git diff** — pass the file path so the diff bytes never pass through your context.

If either report file is missing after both replies arrive, re-dispatch that axis only — the other axis's report stands. A missing `$SESSION/review-repros.json` counts as a missing Spec report.

### Presenting Results to Human

Show Standards findings beside the Spec verdict. Spec alone drives routing. Do not merge axes and do not rerank findings across them.

Use changelog format from the Spec report — Added / Changed / Fixed sections describing **what the user/system can now do**, not which files were edited. Group related changes; use feature names over contract names. Then present both reports:

```markdown
## Standards
{bounded read of `$SESSION/review-standards.md` `## Findings`: documented-convention violations first,}
{then baseline smells — never reordered; if the axis reported none, show `No findings.`}

## Spec
{bounded read of `$SESSION/review-spec.md` — `## Contract Verification` (count PASS vs total) and `## Advisories` (critical/warning only — drop info unless relevant)}
```

When describing the run, name each shard's builder from the `- builder:` line of its `outcome.md` (`claude` → `cf:implement`, `omp` → `OMP ($PI_DESC)`).

### Handling the Verdict

Route on the **Spec verdict** only. A Standards documented-convention violation is shown beside it and is treated like a warning advisory when choosing between the two APPROVE branches below; it never turns an APPROVE into REQUEST_CHANGES.

- **no spec available** → call `AskUserQuestion` with options: "Supply the spec path", "abort-flow", "Other" (nothing to judge; do not send this back to implement).
- **APPROVE, no advisories and no Standards documented-convention violation** → present changelog to human → **run post-PASS rebase** (see below). Done.
- **APPROVE with advisories** (Spec advisories, or any Standards documented-convention violation) → present changelog + advisories + Standards findings to human, then call `AskUserQuestion` with options: "Address all now (loop to implement)", "Address only critical advisories", "Ship as-is — accept advisories", "Other". On "Ship as-is" or after advisories addressed, **run post-PASS rebase**.
- **REQUEST_CHANGES with contract failures** → re-launch only the shards that hold the failing contracts, measured on the review's repros:
  1. Turn the repros into test cases: `"$SCRIPTS/cf-pi-add-repros.sh" "$SESSION" "$SESSION/review-repros.json"`. It prints `ADDED <contract> R<n>` or `DUPLICATE <contract> <id>` per repro and exits 0. On a non-zero exit (2 usage or missing file, 3 malformed entry, 4 jq missing, 5 a contract not in contracts.json) nothing was changed: re-dispatch the Spec axis only, quoting the script's stderr line.
  2. Increment `retries_used`.
  3. Map each contract the Spec reply lists as `<Name>: FAIL` to its shard id: `jq -r --arg c "<Name>" '.groups | to_entries[] | select(.value.contracts | index($c)) | .key' "$SESSION/shards.json"`. A FAIL contract that maps to no shard means the verdict and `shards.json` disagree: escalate.
  4. Tell the human which shard ids re-launch, then re-launch only those. On Claude, run §3.2 steps 2–5 for each shard, starting with `cf-pi-run.sh --prepare-only` so the new `R<n>` cases reach the brief, and give the agent `$SESSION/review-spec.md` as the failure details. On OMP, one background Bash in a single message, in the §3.6 single-task form (`run_in_background: true`, `timeout: 7200000`) restricted to those ids; each shard's `cf-pi-run.sh` reuses its worktree and rebuilds the brief from contracts.json, so the new `R<n>` cases reach the worker.
  5. Collect and route as in §3.3 and §3.4, recording the round. When every shard is PASS, the integration gate rebuilds `cf/$CF_SLUG` from the flow base; then run Phase 4 again.
  6. Do NOT rebase yet — the cf branch accumulates more commits.
- **REQUEST_CHANGES with fundamental design issues** → this means a contract is wrong, not just the implementation. Loop back to plan with the review findings (`$SESSION/review-spec.md`) as the partial-replan input, the way §3.4 handles a NEEDS_REPLAN shard. Increment `retries_used`. Do NOT rebase.

An approved finding can ask the builder to delete or create a file that no contract declares, such as an orphan the change left behind. Declare it before re-launching, or the scope gate fails the whole shard `undeclared_file_touched`: `"$SCRIPTS/cf-pi-declare-files.sh" "$SESSION" <Contract> <path>`, with one or more paths, naming the contract whose change the file belongs to. It prints `DECLARED <contract> <path> shard-<id>`; re-launch that shard. On a non-zero exit, show its stderr to the human and re-launch nothing. Declare only the files the approved finding names: the scope gate still fails anything else the builder touches.

### Post-PASS spec maintenance

When an APPROVE branch above says to run the post-PASS rebase and the `spec` plugin is installed, first read `${CLAUDE_PLUGIN_ROOT}/docs/post-pass-protocol.md` § Post-PASS spec maintenance and follow it; otherwise skip this step.

### Post-PASS rebase + delivery

When an APPROVE branch above says to run the post-PASS rebase, read `${CLAUDE_PLUGIN_ROOT}/docs/post-pass-protocol.md` § Post-PASS rebase + delivery and follow it: it rebases the cf branch, interprets `cf-rebase.sh`'s status, and closes with the fast-forward guidance.

---

## Context Compression

When forwarding to the next phase: **preserve** concrete facts (paths, types, signatures, evidence), decisions + outcomes, constraints + code evidence, test cases with values. **Discard** investigation process, full analyses of rejected alternatives (keep names only), verbose reasoning the next agent won't use. **Reshape** to what the receiver needs. **Bias toward over-including** — missing context causes expensive loop-backs.

---

## Loop Back Mechanism

When looping back to research, send an **enriched goal**: original goal + what was attempted in Phase X + the obstacle + what's needed to proceed. The research agent treats it as a more specific goal — it doesn't know it's a loop.

Every loop-back increments `retries_used`. The single counter caps total flow churn at 4.

---

## Escalation

When you cannot proceed (`retries_used >= 4`, all contracts unresolved, fundamental blocker), read `${CLAUDE_PLUGIN_ROOT}/docs/escalation-protocol.md` and follow it. Key principle: re-enter at the **earliest phase invalidated by the change**.

---

## Failure Conditions

| Condition | Action |
|-----------|--------|
| Research finds nothing relevant | Escalate: "Codebase has nothing related to this goal. Start from scratch or wrong codebase?" |
| All High decisions rejected by human | Escalate: "All approaches rejected. Provide direction or research alternatives?" |
| All implement contracts Unresolved | Route per §3.4: each shard ends `NEEDS_REPLAN incomplete-contracts` or `escalate`, and the partial replan or the escalation follows. If `retries_used` is already at cap, escalate. |
| All review contracts FAIL | Re-run implement (1st time) or escalate (2nd time, or if budget exhausted) |
| `retries_used >= 4` | Escalate with full context |

---

## Cleanup

At the end of the flow (success OR escalation), invoke the cleanup script that `cf-pi-setup.sh` registered in `$SESSION/env.sh`:

```bash
. "$SESSION/env.sh"
[ -n "${CLEANUP_SCRIPT:-}" ] && [ -x "$CLEANUP_SCRIPT" ] && bash "$CLEANUP_SCRIPT"
```

Captures the final diff and removes the worktree. **The cf branch (`cf/$CF_SLUG`) intentionally survives** — it carries the per-contract commit history the human needs to fast-forward (success path) or salvage (escalation path). `$SESSION/` is also preserved for inspection. Log both the session path and the surviving branch name.

### Scaffolding leaves no trace

Shard branches, the integration branch, checkpoint tags, and rollback refs are cf's own machinery, not the user's work — they must not accumulate in the project. **On the success path only**, remove them once the run is integrated:

```bash
. "$SESSION/env.sh"
"$SCRIPTS/cf-pi-cleanup.sh" "$SESSION" "$CF_SLUG"
```

`cf/$CF_SLUG` already carries the integration gate's linear landing, so nothing is lost. The integration branch and its `$SESSION/integrated-work` checkout go only when their tree is the one on `cf/$CF_SLUG`; when the block prints `kept …` instead, pass that line to the human. **On the escalation path, delete none of it** — design §3's worst case has the human cherry-picking validated contract commits off those very branches and tags.

Then tell the user the one command that erases cf from the project entirely, and say it plainly — after they merge, nothing about which tool produced the work should remain:

```
git branch -D cf/<slug>      # after merging; the commits live on in your branch
```

Never delete `cf/$CF_SLUG` automatically — it holds the deliverable, and the user owns that decision.

---

## Rules

1. **Context isolation**: never pass information not listed in the phase's context spec.
2. **Contracts are behavioral**: they define input/output/errors, not file paths — implementation plan is separate guidance.
3. **Validate before flow**: check output meets requirements before passing to next phase.
4. **Save everything**: all outputs to `$SESSION/` for traceability.
5. **Opinionated, not bureaucratic**: when presenting to human, always include your analysis and recommendation.
6. **Agents provide decision support**: if an agent's Unresolved item lacks a suggested resolution path, ask it to provide one before proceeding.
7. **Failure questions the plan**: implementation failure defaults to revisiting contracts, not shipping partial delivery — partial requires explicit human approval.
