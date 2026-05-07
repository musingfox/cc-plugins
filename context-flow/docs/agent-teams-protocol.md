# Agent Teams Protocol

Agent Teams are the **default mode** for Research and Review phases. This protocol is loaded by the orchestrator for both phases.

There are two implementations. The **angle definitions, dispatch context schema, and Output Schema below are shared by both** — only the coordination mechanism differs.

| Implementation | When | Mechanism |
|----------------|------|-----------|
| **Native** | `--deep` mode (and `TeamCreate` / `SendMessage` are available) | Teammates created via `TeamCreate`, communicate via `SendMessage`, can cross-check and debate findings before reporting back |
| **Parallel** | `default` mode, or fallback when native tools unavailable | Orchestrator dispatches teammates concurrently via `Agent`; each works independently; orchestrator synthesizes outputs |

Single-agent skip conditions are defined in `commands/cf.md` (`--fast`, trivial goals, etc.).

---

## Native Mode

Use when `--deep` mode is active and the orchestrator has `TeamCreate`, `SendMessage`, `TeamDelete` in its tool set.

### Setup

```
TeamCreate(team_name: "cf-research-<short-id>", description: "Research team for: <one-line goal>")
```

Use a short, descriptive `team_name` per phase (e.g., `cf-research-auth-oauth2`, `cf-review-payments`). The team's task list (`~/.claude/tasks/<team_name>/`) is auto-created and shared by all teammates.

### Spawning Teammates

For each angle/lens, call `Agent` with `team_name` set to the team and a stable `name`:

```
Agent(
  subagent_type: "context-flow:research",
  team_name: "cf-research-<short-id>",
  name: "<teammate-name>",
  model: "<resolved tier>",
  prompt: "<dispatch context — see schemas below>"
)
```

**Teammate naming rules** — names are how teammates address each other in `SendMessage`. Always use these conventions, never UUIDs:

| Phase | Suggested names |
|-------|-----------------|
| Research | `breadth`, `depth`, `consumer`, `producer`, `existing`, `greenfield` (pick names that match the angles you chose) |
| Review | `contracts`, `security`, `quality` (matches the lens) |

The orchestrator (you) is referred to by teammates as `team-lead` (default) or by the `agent_type` you set in `TeamCreate`. Either form should work; prefer `team-lead`.

### Coordination Protocol

After spawning all teammates, send each its initial brief via `SendMessage`. Teammates then work; they can `SendMessage` peers to cross-check findings or `SendMessage` you for clarification.

**Inter-teammate message templates** (teammates use these — include them in the dispatch prompt):

```
# Cross-check a peer's finding
SendMessage(to: "<peer>", summary: "cross-check constraint X",
  message: "I see your finding that X is enforced at module Y. From my angle I found Z which contradicts that — can you re-examine?")

# Request narrow exploration help
SendMessage(to: "<peer>", summary: "help with module Z",
  message: "Your angle covers Z directly. Does Z expose a public API for <thing>? Need this for my <X> finding.")

# Report completion to lead
SendMessage(to: "team-lead", summary: "research angle done",
  message: "<your full Output Schema sections — Existing Capabilities, Constraints, Decision Points, Completed, Unresolved>")
```

Teammates go idle between turns. **Do not interpret idle as "done"** — wait for an explicit completion message that includes the full Output Schema.

### Synthesis (Native)

After all teammates have sent their completion messages, synthesize using the same merge format as Parallel mode (see Output Schema below). The native-mode bonus: cross-check exchanges between teammates often produce stronger Convergence (high-confidence agreements after debate) and a tighter Divergence list (genuine open trade-offs, not crossed wires).

If a teammate goes silent past a reasonable budget (e.g., 2× the slowest peer), prompt with:
```
SendMessage(to: "<silent>", summary: "status check",
  message: "Are you blocked? Send your current Output Schema even if incomplete.")
```

### Shutdown

After synthesis is saved to `$SESSION/research.md` (or `review.md`):

```
# Send shutdown_request to each teammate
SendMessage(to: "<teammate>", message: {type: "shutdown_request", reason: "phase complete"})

# Once all teammates have replied with shutdown_response approve=true:
TeamDelete()
```

If a teammate rejects shutdown, treat it as the phase being incomplete — read its reason, address, then retry.

### Re-run Budget (Native)

Same as parallel: max **1 re-run** per Agent Teams phase. If you re-run, prefer **reusing the existing team** (send a new brief via `SendMessage`) over `TeamDelete` + recreate — preserves task list continuity.

---

## Parallel Mode

Use in `default` mode, or as fallback when native tools are unavailable.

The orchestrator dispatches multiple sub-agents in a single message (parallel via multiple `Agent` tool calls), each works independently, and the orchestrator merges their outputs into a unified result. No inter-agent communication; the orchestrator is the only coordinator.

---

## Research Teams

### Angle Identification

Based on the goal, identify 2-3 exploration angles. Common patterns:

- **Breadth vs depth**: one teammate maps overall architecture, another drills into the most relevant module
- **Different subsystems**: for cross-cutting goals, one teammate per affected layer (e.g., API, data, UI)
- **Existing vs greenfield**: one teammate investigates existing patterns, another explores what's needed but doesn't exist yet
- **Consumer vs producer**: one teammate looks at how the feature will be used, another at how data/events flow in

Choose angles that maximize coverage with minimal overlap.

### Dispatch Context

Each research teammate receives:

```markdown
You are a research teammate exploring the **{angle name}** perspective.

## Goal
{content of goal.md}

## Scope
Working directory: {cwd}

## Your Angle
{description of this perspective's exploration focus}

## Your Task
Explore the codebase through your angle. Produce a capability inventory following this schema:

## Existing Capabilities
- `[file path]`: [what it does] — [relevant interfaces/exports]

## Relevant Patterns
- [pattern name]: [where used] — [how it works]

## Constraints
- [constraint]: [evidence from code, with file path and line reference]

## Key Files
- `[file path]`: [why it matters for this goal]

## Decision Points
- [a valid choice your angle surfaced where the human's preference matters — what's at stake, options found, your tentative recommendation]
  (omit this section if your angle surfaced no choices — only state-of-the-world findings)

## Completed
- [What aspects were fully investigated] [confidence: high | medium]

## Unresolved
- [What could not be determined]
  - Why: [why this information is missing]
  - Impact: [how this affects planning]
  - Suggested resolution: [suggestion]
```

**Decision Points vs. Unresolved**: Unresolved = missing information that must be obtained. Decision Points = valid choices where multiple answers are correct and the human's preference decides. Don't conflate them.

**External-source tagging**: when a teammate's finding comes from outside the local codebase (ctx7, WebFetch, library docs), it MUST carry an `[external: <source>]` tag. Synthesis preserves the tag — downstream phases need to distinguish facts with code evidence from facts with documentary evidence.

### Synthesis

After all teammates complete, the orchestrator merges findings into a unified research output:

```markdown
## Existing Capabilities
{merged from all teammates, deduplicated, with file paths}

## Relevant Patterns
{merged}

## Constraints
{merged — if teammates found conflicting constraints, note both with evidence. Preserve `[external: <source>]` tags from teammate output verbatim.}

## Key Files
{merged, deduplicated}

## Completed
{merged, take the highest confidence when teammates agree, note disagreement when they don't}

## Unresolved
{merged, deduplicated}

## Convergence
{where teammates' findings agree — high-confidence facts}

## Divergence
{where findings conflict or reveal trade-offs — decision points for planning}
```

Save to `$SESSION/research.md`.

---

## Review Teams

### Lens Assignment

Dispatch 2-3 review teammates with different review lenses:

| Lens | Focus | Verdict Authority |
|------|-------|-------------------|
| **Contract compliance** | Verify each behavioral contract against the diff and test results | **Authoritative** — determines PASS/FAIL |
| **Security & performance** | Injection risks, auth gaps, resource leaks, O(n²) patterns, unbounded queries | Advisory only |
| **Code quality & correctness** | Race conditions, edge cases, maintainability, dead code, naming | Advisory only |

The contract compliance teammate's results determine the overall verdict. Other teammates contribute advisories.

### Dispatch Context

Each review teammate receives:

```markdown
You are a review teammate focused on **{lens name}**.

## Your Review Focus
{description of what to look for}

## Behavioral Contracts
{contracts from plan}

## Test Cases
{test cases from plan}

## Implement Concerns
{concerns from implement agent, if any — otherwise omit}

## Changes
{git diff output}

## Your Task
Review the changes through your lens. Produce:

### Findings
- [finding]: [evidence from diff] — [severity: critical | warning | info]

### Summary
{1-2 sentence overall assessment from your lens}
```

For the **contract compliance** teammate, add:

```markdown
For each contract, determine PASS or FAIL with specific evidence from the diff.
Run test cases if they aren't already passing.

Output as:
### [Contract Name]
- **Status**: PASS | FAIL
- **Evidence**: [specific code reference]
```

### Synthesis

After all teammates complete, the orchestrator merges into a unified review:

```markdown
## Contract Verification
{from contract compliance teammate — authoritative}

## Advisories
{merged from security/performance and code quality teammates}
### [Advisory Title]
- **Category**: security | performance | maintainability | correctness
- **Severity**: critical | warning | info
- **Detail**: [what, why, suggested fix]
- **Source**: {which review lens found this}

## Verdict
{APPROVE or REQUEST_CHANGES — based on contract verification only}
```

Save to `$SESSION/review.md`.

---

## Re-run Budget

- Max **1 re-run** per Agent Teams phase (research or review)
- If re-run limit reached and orchestrator still needs more exploration → escalate to human
