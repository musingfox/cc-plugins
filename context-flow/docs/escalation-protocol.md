# Escalation Protocol

This protocol is loaded on-demand by the orchestrator when escalation is needed (loop limit reached, all contracts unresolved, fundamental blocker).

## Escalation Format

Present to the human:

> ## Situation
> {what happened — factual, concise}
>
> ## What Was Attempted
> {which phases ran, what they produced, what went wrong}
>
> ## Analysis
> {your assessment of why this is stuck}
>
> ## Options
> 1. **{Option A}**: {description, trade-offs}
>    - **Re-entry**: {where the flow resumes}
> 2. **{Option B}**: {description, trade-offs}
>    - **Re-entry**: {where the flow resumes}
> 3. **Abort**: {what has been accomplished so far}
>
> ## Recommendation
> {your suggested path and reasoning}

## Re-entry Rules

After the human chooses an option, re-enter at the **earliest phase invalidated by the change**:

| Type of Change | Re-entry Point |
|---------------|---------------|
| Human provides missing information (no design change) | Re-run the stuck phase with new info |
| Human revises a Low-impact decision | Re-run from implement with updated contracts |
| Human revises a Medium/High-impact decision | Re-run from plan → human gate again |
| Human changes the goal or scope | Re-run from research |
| Human provides a new approach | Re-run from plan (skip research if codebase facts unchanged) |
