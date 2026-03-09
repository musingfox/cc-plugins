---
description: "Context-flow pipeline — agents defined by what they see, not who they are"
argument-hint: "<goal>"
allowed-tools: [Agent, Read, Write, Bash, Glob, Grep]
---

# Context Flow Orchestrator

You manage a pipeline of agents. Your job:
1. Control what context each agent sees
2. Validate outputs meet contract before passing to next phase
3. Compress between phases — pass conclusions, discard reasoning

## Setup

```bash
SESSION="/tmp/context-flow-$(date +%s)"
mkdir -p "$SESSION"
```

Write the user's goal to `$SESSION/goal.md`.

## Pipeline

---

### Phase 1: Research

**Agent**: `context-flow:research`

**Context to pass**:
```
## Goal
[content of goal.md]

## Scope
Working directory: [current working directory]
```

**Nothing else**. Agent explores from scratch.

Save output to `$SESSION/research.md`.

**Contract validation before proceeding**:
- Output has "Existing Capabilities" section with file paths
- Output has "Constraints" section with evidence
- If either is missing or empty, re-run with feedback

---

### Phase 2: Plan

**Agent**: `context-flow:plan`

**Context to pass**:
```
## Goal
[1-2 sentence compressed goal]

## Codebase Research
[content of $SESSION/research.md]

## Contract Requirements
Your output MUST:
1. Address every Constraint listed in the research above
2. Every contract must have at least one test case with concrete input → expected output
3. Test cases must be executable — real function calls, real values
```

Save output to `$SESSION/plan.md`.

**Contract validation before proceeding**:
- Every research constraint is addressed by at least one contract
- Every contract has at least one test case with concrete values
- If validation fails, tell the agent which items are missing and re-run

**HUMAN GATE**: Present to user:
1. Contracts (input/output/errors per module)
2. Test cases
3. Unaddressed constraints (if any)
4. Ask: approve / revise / abort

Do NOT proceed without explicit approval.

---

### Phase 3: Implement

**Agent**: `context-flow:implement`

Before spawning, extract from plan.md:
- Contracts section only
- Test cases only
- File paths only

**Context to pass**:
```
## Contracts
[contracts extracted from plan.md]

## Test Cases
[test cases extracted from plan.md]

## Files
[file paths to create or modify]

Implement these contracts. Write the tests. All tests must pass.
```

**Context NOT passed**: goal, research, planning rationale.

**Contract validation before proceeding**:
- All test cases from plan pass (actually execute them)
- If tests fail, show failures to user and ask: re-run implement with failure context, or stop

---

### Phase 4: Review

```bash
git diff
```

**Agent**: `context-flow:review`

**Context to pass**:
```
## Contracts
[same contracts from Phase 3]

## Test Cases
[same test cases from Phase 3]

## Changes
[git diff output]

Verify each contract is satisfied by the changes.
```

Save output to `$SESSION/review.md`.

Present verdict:
- APPROVE → done, show summary
- REQUEST_CHANGES → show issues, ask user: iterate or accept

---

## Context Flow

```
goal ──→ [research] ──→ research.md
              │              │
              │         validate: has capabilities + constraints?
              │              │
              ▼              ▼
         [plan] ←── research.md + contract requirements
              │
              ├── validate: constraints covered? tests concrete?
              │
              ▼
         HUMAN GATE
              │
              ▼
    contracts + tests only ──→ [implement]
                                    │
                               validate: tests pass?
                                    │
                          contracts + diff ──→ [review] ──→ verdict
```

## Rules

1. **Context isolation**: never pass information not listed in the phase's context spec
2. **Contract as context**: contract requirements are passed AS context to the agent, not as prompt instructions
3. **Validate before flow**: check output meets contract before passing to next phase
4. **Save everything**: all outputs to `$SESSION/` for traceability
