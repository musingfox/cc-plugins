# OMT Workflow: One Command, Autonomous Execution

## Overview

This document defines the **Agent-First** development workflow. The core principle: **One command to start, one decision to approve, then fully autonomous execution**.

## Core Principles

1. **Single Entry Point**: `/omt "goal"` launches the full lifecycle
2. **Decision Points Front-Loaded**: All choices collected before execution
3. **Autonomous Execution**: @hive drives @dev and @reviewer without human intervention
4. **Fail Fast**: Escalate after 3 failures, don't spin indefinitely

## 5 Core Agents

| Agent | Phase | Purpose |
|-------|-------|---------|
| @hive | Coordination | Full lifecycle coordinator — dispatches all other agents |
| @pm | Planning | Requirements management and clarification |
| @arch | Planning | API-First architecture design |
| @dev | Execution | Development implementation (TDD + debugging) |
| @reviewer | Review | Code review + git commit authority |

## Workflow Architecture

```
/omt "Build feature X"
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  PLANNING PHASE (Autonomous via @hive)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  @hive dispatches @pm (autonomous mode)                         │
│    └─▶ .agents/outputs/pm.md (requirements)                     │
│                                                                 │
│  @hive dispatches @arch (autonomous mode)                       │
│    └─▶ .agents/outputs/arch.md (architecture)                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONSENSUS GATE (Single Human Interaction)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  @hive presents:                                                │
│    - Requirements summary                                       │
│    - Architecture summary                                       │
│    - ALL decision points collected from both agents              │
│    - Risk areas                                                  │
│                                                                 │
│  Human: Approve / Modify / Abort                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼ Approved
┌─────────────────────────────────────────────────────────────────┐
│  EXECUTION PHASE (Agent Autonomous)                             │
├─────────────────────────────────────────────────────────────────┤
│  @hive auto-dispatches per task:                                │
│    ├─ @dev (TDD implementation)                                 │
│    └─ @reviewer (review + commit)                               │
│                                                                 │
│  Loop until:                                                    │
│    ✓ All planned items implemented                              │
│    ✗ Or 3 failures → escalate to user                           │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  COMPLETION or ESCALATION                                       │
├─────────────────────────────────────────────────────────────────┤
│  ✓ Complete: All items implemented, report at outputs/hive.md   │
│  ⚠ Escalated: 3 failures, user intervention needed              │
└─────────────────────────────────────────────────────────────────┘
```

## Planning Phase

### How @hive Orchestrates Planning

1. **Capture Goal**: From `/omt` command argument
2. **Dispatch @pm**: In autonomous mode (HIVE MODE OVERRIDE) — no user interaction
3. **Dispatch @arch**: In autonomous mode — pseudocode auto-approved
4. **Extract Decision Points**: Collect all `[DECISION NEEDED]` items from both outputs

### Outputs

| Agent | Output File | Content |
|-------|-------------|---------|
| Human | goal.md | Goal description (from /omt argument) |
| @pm | outputs/pm.md | Requirements, user stories, acceptance criteria |
| @arch | outputs/arch.md | API contracts, architecture, file plan |

## Consensus Gate

The **only point** where @hive interacts with the human.

@hive presents a structured summary containing:
- Requirements overview
- Architecture overview
- All decision points (technical choices, scope boundaries, risks)
- Auto-approved pseudocode list

The human can:
- **Approve**: Execution begins immediately
- **Modify**: Provide feedback, @hive re-runs affected agents
- **Abort**: Stop the entire workflow

## Execution Phase

### Coordinator: @hive

After consensus approval, @hive executes autonomously:

1. **Extract Tasks**: Parse outputs/arch.md for implementation tasks
2. **Execute Loop**: For each task:
   - Dispatch @dev for implementation (TDD)
   - Dispatch @reviewer for review + commit
3. **Handle Failures**: Retry up to 3 times per task
4. **Report Completion**: Or escalate with clear summary

### Execution Flow

```
@hive receives consensus approval
    │
    ├── Task 1: Feature A
    │   ├── @dev implements (TDD)
    │   └── @reviewer commits
    │
    ├── Task 2: Feature B
    │   ├── @dev implements (TDD)
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
| /omt \<goal\> | Launch autonomous lifecycle |
| /init-agents | Initialize agent workspace |
| /help | Help and command reference |
| /approve | Review important changes |
| /git-commit | Emergency manual commit |

## Contract-First Design

Each agent has defined input/output contracts:

### @hive Contract (hive.json)

```yaml
Input:
  - goal: Human's goal description (≥10 chars)
  - workspace_initialized: .agents/ exists
Output:
  - goal_file, pm_output, arch_output
  - consensus_status: approved/modified/aborted
  - execution_summary
```

### @pm Contract (pm.json)

```yaml
Input:
  - task_description: Goal or task description
Output:
  - user_stories, acceptance_criteria, scope
```

### @arch Contract (arch.json)

```yaml
Input:
  - requirements: From @pm or task description
  - project_structure: Current codebase
Output:
  - api_contracts, architecture_diagram, tech_decisions
  - files_to_create, files_to_modify, pseudocode_steps
```

### @dev Contract (dev.json)

```yaml
Input:
  - requirements, architecture, files_to_modify
Output:
  - test_files, implementation_files, tests_status
```

## Git Workflow

### Commit Authority

**Has commit authority:**
- `@reviewer` (automatic after review)
- `/git-commit` (manual, emergency only)

**No commit authority:**
- All other agents (including @hive)

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
├── .gitignore           # Ignores .state/
├── goal.md              # Human's goal
├── outputs/
│   ├── pm.md            # @pm requirements
│   ├── arch.md          # @arch architecture
│   ├── dev.md           # @dev execution report
│   └── hive.md          # @hive completion report
└── .state/              # Infrastructure (gitignored)
    ├── config.json      # Workspace configuration
    ├── state.json       # Task state
    ├── hive-state.json  # @hive lifecycle state
    └── tasks/           # Task tracking data
```

### Hive State Management

`.state/hive-state.json` tracks the lifecycle:

```json
{
  "phase": "execution",
  "goal": "Build user authentication with JWT",
  "started_at": "2026-02-15T10:00:00Z",
  "agents": {
    "pm": { "status": "completed", "output": ".agents/outputs/pm.md" },
    "arch": { "status": "completed", "output": ".agents/outputs/arch.md" }
  },
  "consensus": {
    "status": "approved",
    "decision_points": ["JWT vs session", "PostgreSQL vs SQLite"],
    "user_decisions": { ... }
  },
  "execution": {
    "tasks_total": 5,
    "tasks_completed": 2,
    "current_task": 3,
    "failure_count": 0,
    "max_failures": 3
  }
}
```

## Workflow Examples

### Example 1: New Feature

```bash
# 1. Launch autonomous workflow
/omt "Build user authentication with JWT"

# 2. @hive dispatches @pm and @arch autonomously
# 3. @hive presents consensus with decision points
# 4. Human approves

# 5. @hive executes autonomously
# → Dispatches @dev for each task
# → @reviewer commits each completion
# → Reports when done
```

### Example 2: Escalation

```bash
# Execution in progress...

# @dev fails on Task 3 after 3 retries

# @hive escalates:
# Execution paused after 3 consecutive failures.
#
# Progress: 2/5 tasks completed
# Failed: Task 3 - Token refresh endpoint
# Error: Database schema mismatch
#
# Options:
# A) View Details
# B) Fix and Retry
# C) Abort
```

## Best Practices

### 1. Writing Good Goals

- **Be Specific**: "Implement JWT auth with refresh tokens" > "Add auth"
- **Include Context**: Mention constraints, preferences, or existing patterns
- **Scope Appropriately**: One feature per `/omt` invocation

### 2. During Consensus

- **Review Decision Points**: These are the critical choices
- **Check Scope**: Ensure file count is reasonable
- **Validate Architecture**: Verify the design makes sense for your project

### 3. On Escalation

- **Read the Error Summary**: @hive provides actionable information
- **Fix Root Cause**: Address the underlying issue, not symptoms
- **Resume Cleanly**: Re-run `/omt` after fixing

## Troubleshooting

### Consensus Takes Too Long

Check:
- Is the goal too vague? Provide more detail
- Is the project too complex? Split into smaller goals

### Execution Keeps Failing

Check:
- Is the task scope too large? Split into smaller tasks
- Are dependencies met? Check outputs/arch.md
- Is there an environment issue? Verify test setup

### Workspace Issues

```bash
# View current state
cat .agents/.state/hive-state.json | jq

# Check outputs
ls -la .agents/outputs/

# Reset if needed (caution: loses state)
rm -rf .agents/.state && bun run omt/bin/cli.ts init
```

## References

- **Agents**: `agents/` directory
- **Contracts**: `contracts/` directory
- **Commands**: `commands/` directory

---

**Last Updated**: 2026-02-15
**Version**: 3.0 - One Command, Autonomous Execution
**Status**: Production Ready
