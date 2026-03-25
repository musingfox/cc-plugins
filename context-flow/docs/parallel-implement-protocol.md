# Parallel Implement Protocol

This protocol is loaded on-demand by the orchestrator when contract independence detection identifies 2+ independent groups.

## Contract Independence Detection

Parse contracts from plan.md and build a dependency graph. Check three sources of coupling:

1. **Explicit dependencies**: each contract's `depends` field
2. **File overlap**: if two contracts' implementation plan steps target the same file, they are coupled
3. **Test interdependency**: if one contract's test cases reference another contract's output type

Group contracts into independent sets — contracts are independent only if they share no coupling across any of the three sources.

## Decision Logic

- **1 independent group** → do NOT use this protocol; use single agent dispatch
- **2+ independent groups** → parallel dispatch (this protocol)

Inform the human before dispatching:

> **Parallel Implementation Detected**
>
> {N} independent contract groups identified. Dispatching {N} parallel implement agents (max 3) with worktree isolation.
>
> After all complete, will run integration test to verify contracts work together.

**Max 3 parallel agents**. If there are more than 3 groups, merge the smallest groups.

## Parallel Agent Dispatch

For each independent group, dispatch an agent with `isolation: "worktree"`:

```markdown
## Context Summary
{the context summary assembled by orchestrator}

## Your Assigned Contracts
{only the contracts in this group}

## Test Cases
{only test cases for this group's contracts}

## Implementation Guidance
{only steps relevant to this group}

Implement these contracts. Write the tests. All tests must pass.

**Important**: You are working in an isolated worktree. Do NOT assume changes from other contracts — only implement what's assigned to you.
```

## After All Parallel Agents Complete

1. Merge all worktrees back to main working directory
2. Run **all** test cases together (integration test)
3. If integration test fails:
   - Examine the failure
   - If it's a contract interaction issue → escalate to human with analysis
   - If it's a simple merge conflict → attempt resolution or escalate

Proceed to review validation only after integration test passes.
