# Agent Teams Protocol

This protocol is loaded on-demand by the orchestrator when ACS complexity assessment triggers Agent Teams mode.

## Detection: Native vs Subagent Mode

```bash
if [ -n "$CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" ]; then
    echo "Native Agent Teams mode available"
else
    echo "Falling back to subagent mode"
fi
```

## Layer 1: Subagent Mode (Default)

**Identify angles from research output**:
- Look for alternative approaches, unresolved trade-offs, or conflicting constraints
- Extract 2-3 distinct perspectives that need exploration
- Each angle should represent a different assumption or priority (e.g., "performance-first", "backward-compatibility-first", "minimal-change")

**Dispatch 2-3 parallel agents** using the Agent tool:

For each angle:
```markdown
You are exploring the **{angle name}** perspective for this goal.

## Goal
{compressed goal from goal.md}

## Research Context
{compressed research output — same as what Plan would receive}

## Your Angle
{description of this perspective's priorities and assumptions}

## Your Task
Analyze this goal through your angle. Produce:
1. **Key Insight**: What does this perspective reveal that others might miss?
2. **Risks**: What could go wrong if this perspective is ignored?
3. **Recommendation**: Concrete approach aligned with this angle (1-3 steps)

Output format:
## {Angle Name}
### Key Insight
...
### Risks
...
### Recommendation
...
```

**Synthesize results** after all agents complete:

```markdown
## Agent Teams Synthesis

### Angles Explored
| Angle | Key Insight | Recommended Approach |
|-------|-------------|---------------------|
| {angle 1} | {insight} | {approach summary} |
| {angle 2} | {insight} | {approach summary} |
| {angle 3 if any} | {insight} | {approach summary} |

### Convergence
{where all angles agree — these are safe assumptions}

### Divergence
{where angles conflict — these are critical decision points}

### Recommendation
{your synthesis: which angle(s) to prioritize and why, based on goal and constraints}
```

Save synthesis to `$SESSION/agent-teams.md`.

## Layer 2: Native Agent Teams Mode (Upgrade)

If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set, use the native Agent Teams API instead:

**Spawn teammates** with the same angle-based context as Layer 1. Teammates can:
- Message each other to debate trade-offs
- Request specific code exploration from each other
- Converge on a shared recommendation

**Wait for team consensus** or divergence report. Output format is the same as Layer 1 synthesis.

## Human Co-Decision

Present the Agent Teams synthesis to the human:

> ## Multi-Perspective Analysis Complete
>
> {synthesis content from above}
>
> **Options**:
> 1. **Accept recommendation** — proceed to Plan with this direction
> 2. **Choose different angle** — specify which angle to prioritize
> 3. **Request deeper exploration** — re-run Agent Teams with refined angles (counts toward Agent Teams re-run budget)
> 4. **Abort** — stop here
>
> **Your decision?**

If human requests deeper exploration and Agent Teams re-run budget is not exhausted, refine angles based on feedback and re-run. Otherwise, escalate.

**After human decision**, proceed to Phase 2: Plan with the selected direction.

## Re-run Budget

- Max **1 re-run** of the Agent Teams phase
- If re-run limit reached and human still requests more exploration → escalate
