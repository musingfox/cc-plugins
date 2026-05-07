# Context-Flow Improvement Plan

Based on the strict review of 0.2.2 and the discussion on "minimal context vs. richer tooling," this plan organizes the work into four independently shippable batches. Each batch can be committed and verified on its own.

## Design Principle Refinements (precedes any implementation)

The original "give the agent as little as possible" rule is split into three:

1. **Information context stays tightly compressed.** Phase-to-phase handoffs only carry facts, decisions, and test cases the next agent actually needs. Keep current behavior.
2. **Execution context (tools / skills) is configured per task.** Tools are a dispatch-time decision, not part of the agent's identity. Every token must earn its place.
3. **Reports to humans lead with the *consequence* of a change, not the change itself.** Describe the downstream effect, not the diff-level fact.

These three principles go into the Core Principle section of `docs/DESIGN-v2.md` and govern all subsequent changes.

### Principle 3 in concrete terms

| Anti-example (the change itself) | Good example (consequence of the change) |
|---|---|
| "Modified the `ORDER BY` clause in `buildQuery()`" | "Query results now return in reverse-chronological order; existing callers that relied on the old order will break" |
| "Bumped cache TTL from 60s to 300s" | "Hot-data hit rate is expected to rise, but writes can take up to 5 minutes to surface" |
| "Added `deleted_at` column to schema" | "Soft-delete is now active; existing `SELECT *` queries will return an extra column" |
| "Added `validateEmail()`" | "The signup endpoint now rejects email addresses that don't conform to RFC 5322" |

The test for every bullet: **what will downstream observers see differently after this change?** If the answer is still "the code looks like this," the bullet isn't done.

This principle reshapes three Output Schemas:
- `agents/implement.md` — Completed bullets
- `agents/review.md` — What Changed (Added / Changed / Fixed)
- `commands/cf.md` — Human Gate Scope Review

Tracked in Batch 2 as B2.9.

---

## Batch 1 — Blocking fixes (must ship first, 0.2.3)

Goal: make 0.2.2 actually runnable and remove self-contradictions.

| # | Issue | Action | Files |
|---|---|---|---|
| B1.1 | Plugin-root-relative protocol paths fail at runtime | Switch to `${CLAUDE_PLUGIN_ROOT}/docs/...`; define a single variable in `commands/cf.md` for reuse | `commands/cf.md` |
| B1.2 | README claims 3 agent variants per stage; implementation has 1 | Rewrite the "Model Tier System" section as "single agent + dynamic model" | `README.md` |
| B1.3 | Teammate model rule contradicts itself ("never below standard" vs. "use haiku for mechanical inventory") | Pick one. Recommended: keep the haiku-for-mechanical exception, drop the absolute "never below standard" wording | `commands/cf.md`, `README.md` |
| B1.4 | Native Agent Teams branch is described but not wired up (no `SendMessage` / team setup) | Short term: remove the native branch from docs; protocol files speak only of "parallel sub-agent exploration." Long term handled by Batch 4 | `commands/cf.md`, `docs/agent-teams-protocol.md` |

**Verification:** run `/cf "simple bugfix"` and `/cf --deep "new module design"` end-to-end; confirm all four protocol docs load and no contradictory wording remains.

---

## Batch 2 — Consistency and resilience (0.2.4)

Goal: close schema gaps, stabilize counters, complete parallel-implement story, and adopt the "report consequence" principle.

| # | Issue | Action | Files |
|---|---|---|---|
| B2.1 | `Decision Points` missing from teammate dispatch schema while synthesis demands it | Add `## Decision Points` to the teammate output schema in `agent-teams-protocol.md`, OR change synthesis to derive them explicitly from Divergence | `docs/agent-teams-protocol.md` |
| B2.2 | Loop-budget counters not persisted | Write `$SESSION/loop-budget.json`; read/write at every transition; survive context compression | `commands/cf.md` |
| B2.3 | `$SESSION` collides on same-second concurrent runs and never gets cleaned | Use `/tmp/context-flow-$(date +%s)-$$-$RANDOM`; on flow completion, log the retained path (don't auto-delete — keep for traceability) | `commands/cf.md` |
| B2.4 | Reporting Principles claim to "override phase output schemas" but agents never see them | Reframe as "orchestrator reformats before presenting to human"; alternatively, inject the rule into each agent's dispatch context | `commands/cf.md` |
| B2.5 | Auto-upgrade rule "≥ 3 files" conflicts with the contracts-don't-name-files philosophy | Switch to "≥ 3 contracts" or "spans ≥ 2 modules"; demote file count to advisory hint | `commands/cf.md`, `agents/plan.md` |
| B2.6 | Parallel-implement protocol lacks merge strategy | Add concrete git steps (cherry-pick vs. merge), conflict-escalation criteria, worktree cleanup policy | `docs/parallel-implement-protocol.md` |
| B2.7 | `agents/plan.md` description says "interface contracts" | Change to "behavioral contracts" to match the rest of the docs | `agents/plan.md` |
| B2.8 | `plugin.json` and `marketplace.json` descriptions drift | Unify into one sentence; move `[Experimental]` into `plugin.json` so installers see it | `plugin.json`, `marketplace.json` |
| B2.9 | Reports describe "the change itself" rather than "what the change causes" | Add the downstream-effect rule + anti-example table to all three schemas; upgrade Reporting Principles from "lead with outcome" to "lead with consequence" | `agents/implement.md`, `agents/review.md`, `commands/cf.md` (Reporting Principles + Human Gate Scope Review) |

**Verification:** run a parallel-implement flow with two independent contracts; confirm the worktree merge step has command-level guidance. Run a small change end-to-end and check that human-facing reports describe consequences, not diffs.

---

## Batch 3 — Execution context expansion (0.3.0, requires design)

Goal: let agents complete their work without stuffing extra information into the prompt — capability comes through dispatch-time injection. This is a minor bump because it changes what agents can do.

### 3.1 Tool expansion

| Phase | Current | Add | Why |
|---|---|---|---|
| research | Read / Grep / Glob / Bash | + WebFetch, + context7 (`mcp__plugin_context7_context7__*`) | Verify external library / API behavior instead of guessing or kicking back as Unresolved |
| plan | Read / Grep / Glob | unchanged | Read-only analysis is sufficient |
| implement | Read / Edit / Write / Bash / Glob / Grep | unchanged | Already appropriate |
| review | Read / Grep / Glob / Bash | + WebFetch (optional) | Validate CVEs / library advisories |

**Note:** tools go in the `tools:` frontmatter of `agents/*.md`, not the orchestrator's `allowed-tools` (which only governs the orchestrator itself).

### 3.2 Skill injection mechanism (new design)

Don't hard-code skills into agent frontmatter — that pollutes every dispatch. Inject them in the orchestrator's dispatch context only when the phase task plausibly needs them:

```markdown
## Available Skills
- `find-docs`: when authoritative library/API behavior is needed
- `adr-ref-guard`: when scanning for stale ADR references
```

Add a "Skill Injection" section to `commands/cf.md` listing per-phase candidate skills and their trigger conditions.

### 3.3 Slim down agent identity

- Remove the `model:` field from `agents/*.md` frontmatter — model is already chosen dynamically by the orchestrator.
- Keep `tools:` to a "minimum common set" for that phase; specialized tools arrive via dispatch injection.

**Verification:**
- After context7 is granted, can the research agent answer "behavior diff between lib X v3 and v2" without a loop-back?
- Are skills only visible to the agent when actually injected?

---

## Batch 4 — Native Agent Teams (≥ 0.4.0, blocked on external readiness)

Goal: when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is genuinely supported, complete the native-mode story.

Preconditions (provided by Claude Code harness):
- `Agent` tool's `name` / `team_name` parameters are stable
- `SendMessage` is reliable between sub-agents
- `TeamCreate` is documented

Work:
- Add `SendMessage`, `TeamCreate` to `commands/cf.md` `allowed-tools`
- Rewrite the native branch in `docs/agent-teams-protocol.md`: explicit team setup, teammate naming rules, message templates
- Add a fallback detector: if the env var is set but `SendMessage` is unavailable, downgrade to parallel mode and warn

**Out of scope for now.** Batch 1 already removes the empty native branch so users don't think native mode works today.

---

## Delivery cadence

```
0.2.3 = Batch 1 (blocking, hours)
0.2.4 = Batch 2 (consistency, 1–2 days)
0.3.0 = Batch 3 (tool/skill expansion, design RFC first, 2–3 days)
0.4.0 = Batch 4 (native AT, blocked on external readiness)
```

After each batch, run an end-to-end smoke test: one simple `/cf` goal and one complex one. Confirm transition validation, human gate, and loop budget all behave correctly.

---

## Out of scope for this plan

- Rewriting `DESIGN-v2.md` end-to-end. It's already adequate; Batch 1 only needs to add a short "execution-context configuration" paragraph.
- Building specialized per-phase agent variants (the README's stale claim — explicitly decided against).
- Adding new phases (e.g., deploy / monitor) — outside the contract-driven pipeline's scope.
