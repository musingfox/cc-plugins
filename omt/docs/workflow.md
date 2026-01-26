# OMT Workflow: Humans Plan, Agents Execute

## Overview

This document defines the **Agent-First** human-agent collaborative development workflow. The core principle: **Humans plan through triangle consensus**, **Agents execute autonomously**.

## Core Principles

1. **Triangle Consensus**: Human + @pm + @arch must agree before execution
2. **Contract-Driven**: Clear input/output definitions between agents
3. **Autonomous Execution**: @coord-exec drives @dev and @reviewer without human intervention
4. **Fail Fast**: Escalate after 3 failures, don't spin indefinitely

## 5 Core Agents

| Agent | Phase | Purpose |
|-------|-------|---------|
| @pm | Planning | Requirements management and clarification |
| @arch | Planning | API-First architecture design |
| @coord-exec | Coordination | Dispatch execution agents, escalate after 3 failures |
| @dev | Execution | Development implementation (TDD + debugging) |
| @reviewer | Review | Code review + git commit authority |

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  PLANNING PHASE - Triangle Consensus                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                      Human                                      │
│                    [goal.md]                                    │
│                   Describe goal                                 │
│                   /        \                                    │
│                  /   Agree   \                                  │
│                 /             \                                 │
│            @pm ─────Agree────── @arch                           │
│         [requirements.md]  [implementation.md]                  │
│          Describe needs        Describe approach                │
│                                                                 │
│  All three must agree before entering execution phase           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼ Consensus reached
┌─────────────────────────────────────────────────────────────────┐
│  EXECUTION PHASE (Agent Autonomous)                             │
├─────────────────────────────────────────────────────────────────┤
│  @coord-exec auto-dispatches:                                   │
│    ├─ @dev (development implementation)                         │
│    └─ @reviewer (review + commit)                               │
│                                                                 │
│  Loop until:                                                    │
│    ✓ All planned items implemented                              │
│    ✗ Or 3 failures → summarize status and escalate to user      │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  COMPLETION or ESCALATION                                       │
├─────────────────────────────────────────────────────────────────┤
│  ✓ Complete: All planned items implemented and committed        │
│  ⚠ Conflict: Implementation conflicts with plan, needs review   │
└─────────────────────────────────────────────────────────────────┘
```

## Planning Phase

### Participants

1. **Human**: Provides the goal (what to build and why)
2. **@pm**: Clarifies requirements (acceptance criteria, constraints)
3. **@arch**: Designs implementation (API contracts, file structure)

### Outputs

| Role | Output File | Content |
|------|-------------|---------|
| Human | goal.md | Describe the goal |
| @pm | requirements.md | Describe requirements |
| @arch | implementation.md | Describe implementation approach |

### Consensus Mechanism

```
1. Human creates goal.md
2. @pm reviews goal.md → creates requirements.md
3. @arch reviews goal.md + requirements.md → creates implementation.md
4. Human reviews all documents
   - If changes needed → return to steps 1-3 for relevant party
   - If all agree → enter execution phase
```

**Key Points:**
- No execution starts until all three parties agree
- Each party can request changes to previous outputs
- Iteration continues until consensus is reached

## Execution Phase

### Coordinator: @coord-exec

Once consensus is reached, @coord-exec takes over and runs autonomously:

1. **Validate Planning Outputs**: Ensure goal.md, requirements.md, implementation.md exist
2. **Extract Tasks**: Parse implementation.md for discrete tasks
3. **Execute Loop**: For each task:
   - Dispatch @dev for implementation (TDD + debugging)
   - Dispatch @reviewer for review + commit
4. **Handle Failures**: Retry up to 3 times per task
5. **Report Completion**: Or escalate with clear summary

### Execution Flow

```
@coord-exec receives planning outputs
    │
    ├── Task 1: Feature A
    │   ├── @dev implements
    │   └── @reviewer commits
    │
    ├── Task 2: Feature B
    │   ├── @dev implements
    │   └── @reviewer commits
    │
    └── ... continues until complete or escalation
```

### Failure Handling

```
Task fails
    │
    ├── Retry 1 → @dev tries again
    │
    ├── Retry 2 → @dev tries again
    │
    └── Retry 3 → ESCALATE to user
            │
            ├── Progress report (completed/remaining tasks)
            ├── Error details
            └── Recommended actions
```

## Commands

| Command | Purpose |
|---------|---------|
| /init-agents | Initialize agent workspace |
| /help | Help and command reference |
| /approve | Review important changes |
| /git-commit | Emergency manual commit |

## Contract-First Design

Each agent has defined input/output contracts:

### @pm Contract (pm.json)

```yaml
Input:
  - goal.md: Human's goal description
Output:
  - requirements.md: Detailed requirements with acceptance criteria
```

### @arch Contract (arch.json)

```yaml
Input:
  - goal.md: Human's goal
  - requirements.md: @pm's requirements
Output:
  - implementation.md: API contracts, file structure, implementation plan
```

### @dev Contract (dev.json)

```yaml
Input:
  - requirements.md: What to build
  - implementation.md: How to build
  - files_to_modify: List of files
Output:
  - test_files: Tests created
  - implementation_files: Code created
  - tests_status: "X/Y passed"
```

## Git Workflow

### Commit Authority

**✅ Has commit authority:**
- `@reviewer` (automatic after review)
- `/git-commit` (manual, emergency only)

**❌ No commit authority:**
- All other agents

### Commit Format

```
<type>[optional scope]: <description>

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

## Agent Workspace

### Structure

```
.agents/
├── goal.md              # Human's goal (planning input)
├── requirements.md      # @pm output
├── implementation.md    # @arch output
├── state.json           # Runtime state
├── outputs/             # Agent execution outputs
│   ├── dev.md          # @dev execution report
│   ├── reviewer.md     # @reviewer report
│   └── coord-exec.md   # Coordination report
└── tasks/              # Active tasks
```

### State Management

state.json tracks workflow progress:

```json
{
  "task_id": "TASK-123",
  "current_phase": "execution",
  "planning": {
    "consensus_reached": true,
    "goal": ".agents/goal.md",
    "requirements": ".agents/requirements.md",
    "implementation": ".agents/implementation.md"
  },
  "execution": {
    "coordinator": "coord-exec",
    "tasks_total": 5,
    "tasks_completed": 2,
    "failure_count": 0
  }
}
```

## Workflow Examples

### Example 1: New Feature

```bash
# 1. Human creates goal
echo "Build user authentication with JWT" > .agents/goal.md

# 2. @pm reviews and clarifies
# → Creates requirements.md with acceptance criteria

# 3. @arch reviews and designs
# → Creates implementation.md with API contracts

# 4. Human approves all three documents

# 5. @coord-exec takes over
# → Dispatches @dev for each task
# → @reviewer commits each completion
# → Reports when done
```

### Example 2: Escalation

```bash
# Execution in progress...

# @dev fails on Task 3 after 3 retries

# @coord-exec escalates:
# 🚨 Execution Needs Human Assistance
#
# Progress: 2/5 tasks completed
# Failed: Task 3 - Token refresh endpoint
# Error: Database schema mismatch
#
# Options:
# A) View Details
# B) Fix Manually
# C) Abort

# Human fixes issue, re-runs @coord-exec
```

## Best Practices

### 1. Planning Phase

- **Be Specific in goal.md**: Clear goals lead to better requirements
- **Review All Documents**: Don't skip reviewing @pm and @arch outputs
- **Iterate If Needed**: Better to fix the plan than the implementation

### 2. Execution Phase

- **Trust the Process**: Let @coord-exec run autonomously
- **Don't Intervene Prematurely**: Wait for 3 failures before escalation
- **Check Progress Reports**: Review outputs/coord-exec.md for status

### 3. On Escalation

- **Read the Error Summary**: @coord-exec provides actionable information
- **Fix Root Cause**: Address the underlying issue, not symptoms
- **Resume Cleanly**: Re-run @coord-exec after fixing

## Troubleshooting

### Planning Consensus Not Reached

Check:
- Does goal.md clearly state the objective?
- Did @pm identify all requirements?
- Does @arch's design address all requirements?

### Execution Keeps Failing

Check:
- Is the task scope too large? Split into smaller tasks
- Are dependencies met? Check implementation.md
- Is there an environment issue? Verify test setup

### Workspace Issues

```bash
# View current state
cat .agents/state.json | jq

# Check outputs
ls -la .agents/outputs/

# Reset if needed (caution: loses state)
rm -rf .agents && /init-agents
```

## References

- **Agents**: `agents/` directory
- **Contracts**: `contracts/` directory
- **Commands**: `commands/` directory
- **Quick Start**: `docs/quick-start.md`

---

**Last Updated**: 2026-01-23
**Version**: 2.0 - Humans Plan, Agents Execute
**Status**: Active Development
