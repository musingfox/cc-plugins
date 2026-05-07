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

### Merge Strategy

Each worktree has its own branch (Agent tool with `isolation: "worktree"` returns the branch name). Merge them back into the main working directory in dependency order:

```bash
# For each worktree branch returned by the parallel agents:
git merge --no-ff <worktree-branch> -m "merge: <group-name> contracts"
```

**Why `--no-ff`**: keeps a clear merge commit per group, so the history shows which contracts came from which parallel agent. Aids debugging if integration tests fail.

**Order**: merge in dependency order if the groups have any cross-references (e.g., shared test fixtures). Truly independent groups can merge in any order.

### Conflict Handling

Independent groups should **not** produce file-level conflicts (that's the point of independence detection). If `git merge` reports a conflict, treat it as a signal that independence detection was wrong:

- **File-level conflict (same file edited)** → independence detection failed. Abort the merge (`git merge --abort`), escalate to human with: which contracts conflict, which file, and a recommendation to either (a) re-run sequentially, or (b) split the contract differently.
- **Semantic conflict (no git conflict but tests fail after merge)** → see Integration Test below.

### Integration Test

After all merges succeed:

1. Run **all** test cases from the original plan together (not just per-group).
2. If integration test fails:
   - **Contract interaction issue** (one contract's behavior breaks another) → escalate to human with the failing test, the two contracts involved, and your hypothesis.
   - **Test infrastructure issue** (e.g., shared fixture broken) → attempt one fix, then escalate if still failing.

### Worktree Cleanup

Once merges are complete and integration tests pass, remove the worktrees:

```bash
git worktree list                     # list active worktrees
git worktree remove <path>            # remove each parallel worktree
git branch -d <worktree-branch>       # delete the merged branch
```

Do NOT clean up worktrees if integration tests failed — the human may need to inspect them.

Proceed to review validation only after integration test passes.
