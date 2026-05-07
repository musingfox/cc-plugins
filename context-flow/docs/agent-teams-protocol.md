# Agent Teams Protocol

Agent Teams are the **default mode** for Research and Review phases. This protocol is loaded by the orchestrator for both phases.

Implementation: **parallel sub-agent dispatch with orchestrator synthesis**. The orchestrator dispatches multiple sub-agents in a single message (parallel), each works independently, and the orchestrator merges their outputs into a unified result.

A future "native" mode where teammates communicate directly via inter-agent messaging is tracked as a separate roadmap item and is not enabled in this version.

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

### Synthesis

After all teammates complete, the orchestrator merges findings into a unified research output:

```markdown
## Existing Capabilities
{merged from all teammates, deduplicated, with file paths}

## Relevant Patterns
{merged}

## Constraints
{merged — if teammates found conflicting constraints, note both with evidence}

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
