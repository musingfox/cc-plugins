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

## Batch 3 — Execution context expansion (0.3.0, shipped)

Goal: give research and implement a real path to verify external library / API behavior instead of bouncing to Unresolved. Outcome of three independent reviews (spec / design / adversarial) reshaped the original plan substantially.

### What shipped

| # | Change | Files |
|---|---|---|
| 3.1 | Remove `model:` frontmatter from all 4 agents — orchestrator overrides every dispatch, the line was dead | `agents/*.md` |
| 3.2 | Add `WebFetch` to `tools:` for research and implement (NOT plan/review — no Unresolved-loop pain there) | `agents/research.md`, `agents/implement.md`, `commands/cf.md` Agent Registry |
| 3.3 | Add **External Verification methodology** to research and implement — `ctx7 --version` probe (cross-shell), `ctx7 whoami` auth check, fact-extraction discipline (no raw doc paste), WebFetch fallback | `agents/research.md`, `agents/implement.md` |
| 3.4 | Tag external-source findings with `[external: <source>]` in research output schema — synthesis and downstream phases need to distinguish code evidence from documentary evidence | `agents/research.md`, `docs/agent-teams-protocol.md` |
| 3.5 | Document `ctx7` as optional dependency + warn about direct sub-agent invocation losing tier | `README.md` |

### Decisions explicitly NOT taken (with reasons)

| Discarded | Reason |
|---|---|
| context7 MCP integration | CLI (`ctx7`) wins on every axis — 0 tool-schema overhead, no cross-plugin hard dependency, output is plain text (greppable, cap-able), failure is at invocation not load |
| Skill injection mechanism (original 3.2) | **Spec-blocked**: Claude Code does not support dispatch-time skill injection; `skills:` frontmatter is the only mechanism, and it preloads full skill content (always-on cost). For our use case — telling research how to verify external behavior — a methodology block in the agent's own definition is sufficient and avoids the always-on cost of a skill. |
| Trim `tools:` to minimum + inject specialty (original 3.3 lower half) | Without dispatch-time injection, `tools:` IS the capability surface; trimming it makes the agent useless |
| WebFetch on plan / review | No evidence of Unresolved-loop pain there. Plan is read-only design; review is contract verification. CVE checks belong to the Agent Teams security lens, not the review main agent |
| Domain-restrict WebFetch via permissions | Out of scope — no current threat model justifies the friction. Spec note: `WebFetch` in `tools:` allowlist grants all-domain access |
| Inject lookup methodology via orchestrator dispatch context | **Contradicts B2.4**: Reporting Principles were explicitly framed as orchestrator-side reformat, not agent-prompt nudges. Methodology lives in agent identity, not dispatch hint |

### Adversarial findings folded in

- **ctx7 logged out** → methodology forces `ctx7 whoami` preflight; misleading "lookup failed" is replaced by actionable "run `ctx7 login`"
- **100KB doc bloat** → methodology requires extracting 1-3 facts; raw doc paste forbidden
- **`command -v` not portable** → use `ctx7 --version` instead
- **Direct invocation loses tier** → README.md documents the caveat

### Out of scope (deferred)

- Native Agent Teams (Batch 4)
- Loop-budget interaction with external-lookup retries (no observed flake rate yet — revisit if WebFetch transient failures cause spurious phase re-runs)
- WebFetch permission-rule domain filter (no current threat model)

---

## Batch 4 — Native Agent Teams (0.4.0, shipped)

Goal: enable native Agent Teams now that `TeamCreate` / `SendMessage` / `TeamDelete` are stable in the Claude Code harness.

### What shipped

| # | Change | Files |
|---|---|---|
| 4.1 | Add `TeamCreate`, `TeamDelete`, `SendMessage` to `commands/cf.md` `allowed-tools` | `commands/cf.md` |
| 4.2 | Rewrite "Agent Teams Default" section: native mode for `--deep`, parallel mode for `default`, single-agent skip for `--fast` and trivial goals | `commands/cf.md` |
| 4.3 | Add **Native Mode** section to `agent-teams-protocol.md` — `TeamCreate` setup, teammate naming rules, `SendMessage` templates (cross-check, exploration help, completion), shutdown discipline (`shutdown_request` + `TeamDelete`) | `docs/agent-teams-protocol.md` |
| 4.4 | Document fallback: if `TeamCreate` / `SendMessage` unavailable at runtime → downgrade to parallel mode + warn human once | `commands/cf.md`, `docs/agent-teams-protocol.md` |
| 4.5 | Update `DESIGN-v2.md` Implementation section + Principle #13 to reflect both modes | `docs/DESIGN-v2.md` |
| 4.6 | Update README Key Features bullet | `README.md` |

### 0.4.1 Hardening pass

A multi-lens audit after 0.4.0 ship caught real issues. Verified against primary sources (code.claude.com/docs/en/agent-teams, GitHub issues #32723, #32731) before correcting:

| # | Fix | Files |
|---|---|---|
| 4.7 | **Restore `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` gate** — original 0.4.0 dropped this assuming TeamCreate/SendMessage were GA. Primary docs confirm the feature is still experimental and tools are only loaded at startup when the flag is set. `/cf --deep` without the flag now **aborts with an actionable error** (no silent fallback — user picked `--deep` for cross-check quality, parallel can't deliver that) | `commands/cf.md`, `README.md`, `docs/DESIGN-v2.md`, `docs/agent-teams-protocol.md` |
| 4.8 | `team_name` collision: append `$SESSION_BASENAME` (already has `$$`+`$RANDOM`) so concurrent flows don't collide on `~/.claude/teams/` | `commands/cf.md`, `docs/agent-teams-protocol.md` |
| 4.9 | Persist team handle to `$SESSION/team-<phase>.json` at `TeamCreate` time + Reconnect path. Context compression wipes orchestrator memory; team config persists on disk but the orchestrator's knowledge of team_name does not | `docs/agent-teams-protocol.md` |
| 4.10 | Drop the false `team-lead` canonical recipient. Docs make clear teammates address each other only by names assigned at spawn. Every dispatch prompt now MUST include the line `Address messages to the lead by name: <lead-name>` | `docs/agent-teams-protocol.md` |
| 4.11 | Shutdown rejection cap: 2 rejections per teammate → mark synthesis `tainted`, force `TeamDelete`, escalate to human. Prior wording ("treat as phase incomplete") had no escape | `docs/agent-teams-protocol.md` |
| 4.12 | `TeamDelete` race: retry up to 3× with 1s sleep between, then leave team orphaned (next `/cf` uses different team_name anyway) | `docs/agent-teams-protocol.md` |
| 4.13 | Argument parsing precedence: explicit note that all skip rules read *resolved* mode, not original tokens (`--fast --deep` is `deep`, full stop) | `commands/cf.md` |
| 4.14 | Completion-message discipline: only Output Schema sections in completion; debate context stays in cross-check threads. `[external: <source>]` tags survive `SendMessage` verbatim | `docs/agent-teams-protocol.md` |
| 4.15 | Resolved-by-debate annotation: native synthesis tags Convergence reached only after debate, preserves originally-divergent points in Divergence with annotation. Prevents premature collapse hiding trade-offs from the human | `docs/agent-teams-protocol.md` |
| 4.16 | Silent teammate exit path: 2 status checks then synthesize without it, mark missing angle in Unresolved with `[silent: <name>]` | `docs/agent-teams-protocol.md` |

### Decisions explicitly NOT taken

| Discarded | Reason |
|---|---|
| ~~Drop env-var gating in favor of `--deep` alone~~ | **Reverted in 0.4.1** — primary-source audit confirmed env flag is still required to materialize team tools at startup. `--deep` triggers native intent; env flag enables the runtime |
| Native mode for `default` mode | Native coordination has token / latency overhead that doesn't pay off for routine goals. Reserve it for the explicit "I want maximum quality" knob (`--deep`) |
| `--native` flag | Don't introduce a new flag when an existing one (`--deep`) carries the same intent ("higher quality, willing to pay more") |
| Auto-detect tool availability up-front | The orchestrator's `allowed-tools` declares the tools; if the harness ignores them, the first `TeamCreate` call fails and we fall back. Cheaper than a preflight check on every run |

### Re-run budget

Native mode keeps the same **1 re-run per Agent Teams phase** budget as parallel. On re-run, prefer reusing the existing team (new `SendMessage` brief) over `TeamDelete` + recreate — preserves the team's task list continuity.

### Out of scope (deferred)

- Long-lived teams across multiple `/cf` invocations — every flow creates and tears down its own team
- Teammate-initiated `shutdown_request` — only the orchestrator originates shutdown
- Cross-phase team reuse (one team for both research and review) — phases use separate teams to keep angle/lens definitions decoupled

---

## Delivery cadence

```
0.2.3 = Batch 1 (blocking, hours)
0.2.4 = Batch 2 (consistency, 1–2 days)
0.3.0 = Batch 3 (tool/skill expansion, design RFC first, 2–3 days)
0.4.0 = Batch 4 (native AT, shipped)
0.4.1 = Batch 4 hardening pass (audit-driven, shipped)
```

After each batch, run an end-to-end smoke test: one simple `/cf` goal and one complex one. Confirm transition validation, human gate, and loop budget all behave correctly.

---

## Out of scope for this plan

- Rewriting `DESIGN-v2.md` end-to-end. It's already adequate; Batch 1 only needs to add a short "execution-context configuration" paragraph.
- Building specialized per-phase agent variants (the README's stale claim — explicitly decided against).
- Adding new phases (e.g., deploy / monitor) — outside the contract-driven pipeline's scope.
