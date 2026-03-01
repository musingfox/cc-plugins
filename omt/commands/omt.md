---
name: omt
description: Launch autonomous OMT workflow — dispatches @hive to orchestrate the full planning → consensus → execution lifecycle
argument-hint: <goal description>
allowed-tools: Bash, Glob, Grep, Read, Write, Task, AskUserQuestion
model: claude-sonnet-4-5
---

# /omt — Autonomous OMT Workflow

Launch the full OMT lifecycle with a single command. @hive coordinates everything — you only need to provide a goal and approve the consensus.

## Instructions

### Step 1: Capture Goal

The user's argument is the goal description. Store it as `$GOAL`.

If no argument is provided, ask the user:

```
What do you want to build? Describe the goal in detail.

Example: "Implement JWT-based authentication with refresh token rotation and role-based access control"
```

Validate that the goal is at least 10 characters. If too brief, ask for more detail.

### Step 2: Validate Workspace

Check if `.agents/` directory exists:

```bash
ls .agents/
```

If `.agents/` does not exist:

```
Agent workspace not initialized.

Run /init-agents first to set up the workspace, then run /omt again.
```

Stop execution here if workspace is missing.

### Step 2.5: Check for Interrupted Session

Read `.agents/.state/hive-state.json`. If the file exists and `phase` is non-null and NOT a terminal phase (`completed` or `aborted`):

An interrupted session is detected. Use `AskUserQuestion` to ask the user:

```
Detected an interrupted OMT session.

Phase: {phase}
Goal: {goal from hive-state.json}
Last updated: {updated_at from hive-state.json}
```

Options:
1. **Resume** — Continue the interrupted session from where it left off (uses the original goal)
2. **Start Fresh** — Discard the previous session and start a new one with the current goal
3. **Cancel** — Stop without doing anything

**Resume**: Dispatch @hive with the ORIGINAL goal from `hive-state.json` (not `$GOAL`). @hive's Phase 0 resume detection will determine the correct re-entry point.

**Start Fresh**: Write a clean initial state to `.agents/.state/hive-state.json` to reset:
```json
{
  "phase": null,
  "goal": null,
  "started_at": null,
  "updated_at": null,
  "agents": { "pm": { "status": "pending", "output": null }, "arch": { "status": "pending", "output": null } },
  "consensus": { "status": "pending", "decision_points": [], "user_decisions": null },
  "execution": { "tasks_total": 0, "tasks_completed": 0, "current_task": 0, "failure_count": 0, "max_failures": 3, "tasks": [] }
}
```
Then proceed to Step 3 with `$GOAL`.

**Cancel**: Stop execution.

### Step 3: Ensure outputs directory exists

```bash
mkdir -p .agents/outputs .agents/outputs/dev .agents/outputs/reviews
```

### Step 4: Dispatch @hive

Dispatch the @hive agent using the Task tool:

```
Task({
  subagent_type: 'omt:hive',
  description: 'OMT lifecycle: ' + $GOAL.substring(0, 40),
  prompt: `
    You are @hive, the OMT lifecycle coordinator.

    Goal: ${GOAL}

    Execute the full lifecycle:
    1. Initialize (.agents/goal.md + .agents/.state/hive-state.json)
    2. Dispatch @pm in autonomous mode
    3. Dispatch @arch in autonomous mode
    4. Present consensus summary with decision points → AskUserQuestion
    5. On approval: execute @dev → @reviewer loop per task
    6. Generate completion report to .agents/outputs/hive.md

    Workspace is at .agents/ (already initialized).
    Follow the instructions in your agent definition exactly.
  `
})
```

### Step 5: Report Result

After @hive completes, summarize the outcome to the user:

- If completed: Show task count, commit count, and point to `.agents/outputs/hive.md`
- If aborted: Confirm abortion and explain what was produced
- If escalated: Show the escalation summary and suggested next steps
