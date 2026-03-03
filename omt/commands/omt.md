---
name: omt
description: Full OMT orchestrator — dispatches @pm, @arch, @hive, presents consensus gate, executes @dev/@reviewer loop
argument-hint: <goal description>
allowed-tools: Bash, Glob, Grep, Read, Write, Task, AskUserQuestion
model: claude-sonnet-4-5
---

# /omt — OMT Orchestrator

Full lifecycle orchestrator for the OMT Agent-First workflow. Dispatches all agents, presents the consensus gate, and runs the execution loop. The human provides a goal and approves consensus — everything else is autonomous.

```
/omt "Build feature X"
  → Step 1-3: Capture goal, validate workspace, check resume
  → Step 4: Initialize state
  → Step 5: Dispatch @pm (autonomous requirements)
  → Step 6: Dispatch @arch (autonomous architecture)
  → Step 7: Dispatch @hive (consensus analysis) → present to user → approve
  → Step 8: Execute @dev → @reviewer loop per stage
  → Step 9: Completion report
```

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

### Step 2.5: Resume Detection

Read `.agents/.state/workflow-state.json`. If the file exists and `phase` is non-null and NOT a terminal phase (`completed` or `aborted`):

An interrupted session is detected. Use `AskUserQuestion` to present the situation:

```
Detected an interrupted OMT session.

Phase: {phase}
Goal: {goal from workflow-state.json}
Last updated: {updated_at from workflow-state.json}
```

Options:
1. **Resume** — Continue from where it left off (uses the original goal)
2. **Start Fresh** — Discard the previous session and start new with `$GOAL`
3. **Cancel** — Stop without doing anything

**Resume**: Determine re-entry point by checking output file existence and state:

```
Resume logic:
1. Read workflow-state.json for phase, agent statuses, consensus status, execution progress
2. Check output file existence:
   - .agents/outputs/pm.md exists → PM completed
   - .agents/outputs/arch.md exists → Arch completed
   - .agents/outputs/hive-consensus.md exists → Consensus analysis completed
   - .agents/outputs/dev/ has files → Execution in progress

3. Determine re-entry step:
   - If phase == 'escalated':
     → Resume at Step 8 (Execution Loop), present escalation context first
   - If consensus.status == 'approved' AND execution block exists:
     → Resume at Step 8 (Execution Loop), skip completed stages
   - If .agents/outputs/arch.md exists:
     → Resume at Step 7 (Consensus Gate)
   - If .agents/outputs/pm.md exists:
     → Resume at Step 6 (Dispatch @arch)
   - Otherwise:
     → Resume at Step 5 (Dispatch @pm)

4. Use the ORIGINAL goal from workflow-state.json (state.goal), not $GOAL.
```

**Start Fresh**: Write a clean initial state to reset:
```json
{
  "phase": null,
  "goal": null,
  "started_at": null,
  "updated_at": null,
  "agents": { "pm": { "status": "pending", "output": null }, "arch": { "status": "pending", "output": null }, "dev": [], "reviewer": [] },
  "consensus": { "status": "pending", "decision_points": [], "user_decisions": null },
  "execution": { "tasks_total": 0, "tasks_completed": 0, "current_task": 0, "failure_count": 0, "max_failures": 3, "tasks": [] },
  "event_log": []
}
```
Then proceed to Step 3 with `$GOAL`.

**Cancel**: Stop execution.

### Step 3: Ensure Output Directories

```bash
mkdir -p .agents/outputs .agents/outputs/dev .agents/outputs/reviews
```

### Step 4: Initialize State

Write the goal and initialize workflow state.

```
Write .agents/goal.md with the goal text.

Write .agents/.state/workflow-state.json:
{
  "phase": "init",
  "goal": "$GOAL",
  "started_at": "{ISO timestamp}",
  "updated_at": "{ISO timestamp}",
  "agents": {
    "pm": { "status": "pending", "output": null },
    "arch": { "status": "pending", "output": null },
    "dev": [],
    "reviewer": []
  },
  "consensus": {
    "status": "pending",
    "decision_points": [],
    "user_decisions": null
  },
  "execution": {
    "tasks_total": 0,
    "tasks_completed": 0,
    "current_task": 0,
    "failure_count": 0,
    "max_failures": 3,
    "tasks": []
  },
  "event_log": []
}
```

### Step 5: Dispatch @pm (Autonomous Mode)

Update workflow-state.json: `phase: 'pm'`, `agents.pm.status: 'running'`.

Dispatch @pm using Task tool:

```
Task({
  subagent_type: 'omt:pm',
  description: 'PM requirements: ' + $GOAL.substring(0, 40),
  prompt: `
    HIVE MODE OVERRIDE — Autonomous Requirements Generation

    You are @pm agent operating in HIVE MODE. In this mode:
    - Do NOT wait for user input or present options
    - Do NOT use AskUserQuestion
    - Analyze the goal autonomously and produce requirements directly
    - Write output to .agents/outputs/pm.md

    Goal:
    ${GOAL}

    Project context: Read CLAUDE.md and scan the project structure to understand the codebase.

    Your output MUST include:
    1. User stories (As a... I want... So that...)
    2. Acceptance criteria (testable)
    3. Scope definition (what's in, what's out)
    4. Decision points — list ANY choices where multiple valid approaches exist
       (e.g., "Database: SQLite vs PostgreSQL", "Auth: JWT vs session-based")
       Mark each with: [DECISION NEEDED] tag

    Write the complete requirements to .agents/outputs/pm.md
  `
})
```

After @pm completes:
- Read `.agents/outputs/pm.md` to confirm it exists
- Update workflow-state.json: `agents.pm.status: 'completed'`, `agents.pm.output: '.agents/outputs/pm.md'`
- If @pm fails: update `agents.pm.status: 'failed'`, report error to user, stop

### Step 6: Dispatch @arch (Autonomous Mode)

Update workflow-state.json: `phase: 'arch'`, `agents.arch.status: 'running'`.

Dispatch @arch using Task tool:

```
Task({
  subagent_type: 'omt:arch',
  description: 'Architecture design: ' + $GOAL.substring(0, 40),
  prompt: `
    HIVE MODE OVERRIDE — Autonomous Architecture Design

    You are @arch agent operating in HIVE MODE. In this mode:
    - Do NOT wait for human pseudocode review
    - Auto-approve all pseudocode (mark as "Status: Auto-Approved (Hive Mode)")
    - Do NOT use AskUserQuestion
    - Produce complete architecture autonomously
    - Write output to .agents/outputs/arch.md

    Goal:
    ${GOAL}

    Requirements (from @pm):
    {read contents of .agents/outputs/pm.md}

    Project context: Read CLAUDE.md and scan the project structure.

    Your output MUST follow the L1/L2 arch output format:

    Section 1: Contract Artifacts (L1)
      - Write ACTUAL type/interface definition files to the project
      - Write contract test stubs (RED state — compile but FAIL)
      - Document package dependency graph
      - Record all contract artifact file paths in arch.md Section 1

    Section 2: Architecture Diagram (Mermaid)
    Section 3: Technical Decisions with rationale
      - Mark trade-offs with [DECISION NEEDED] tag

    Section 4: Stage Plan with Change Budgets
      - Each stage: scope, files (max 5), change budget (max 300 impl lines), NOT in scope
      - Use vertical slice strategy (each stage = end-to-end functional slice)

    Section 5: Pseudocode for complex functions (auto-approved in hive mode)

    Also include: File plan (files to create/modify)

    Write the complete architecture to .agents/outputs/arch.md
  `
})
```

After @arch completes:
- Read `.agents/outputs/arch.md` to confirm it exists
- Update workflow-state.json: `agents.arch.status: 'completed'`, `agents.arch.output: '.agents/outputs/arch.md'`
- If @arch fails: update `agents.arch.status: 'failed'`, report error to user, stop

### Step 7: Consensus Gate (Single Human Interaction)

Update workflow-state.json: `phase: 'consensus'`.

This is the **only point where the human is involved** (besides resume detection and escalation).

#### Step 7.1: Dispatch @hive for Consensus Analysis

Dispatch @hive using Task tool to analyze outputs and build consensus:

```
Task({
  subagent_type: 'omt:hive',
  description: 'Consensus analysis',
  prompt: `
    You are @hive, the consensus builder.

    Goal: ${GOAL}
    PM output path: .agents/outputs/pm.md
    Arch output path: .agents/outputs/arch.md

    Execute your full analysis:
    1. Read and parse both agent outputs
    2. Verify contract artifacts (Interface Lock)
    3. Build consensus summary
    4. Build stage execution plan
    5. Write everything to .agents/outputs/hive-consensus.md
  `
})
```

#### Step 7.2: Read and Present Consensus

Read `.agents/outputs/hive-consensus.md`. Present the consensus summary to the user.

Use AskUserQuestion with three options:

```
{consensus summary from hive-consensus.md}

Do you approve this plan for autonomous execution?
```

Options:
1. **Approve** — Accept plan as-is and start autonomous execution
2. **Modify** — Provide feedback, re-run affected agents
3. **Abort** — Cancel this goal entirely

#### Step 7.3: Handle Consensus Response

**Approve**: Update workflow-state.json `consensus.status: 'approved'`. Proceed to Step 8.

**Modify**:
- Read user's modification feedback
- Determine which agent(s) need re-running (@pm and/or @arch)
- Re-dispatch affected agent(s) with modifications included in the prompt
- Re-dispatch @hive for updated consensus analysis
- Return to Step 7.2 to present updated consensus

**Abort**: Update workflow-state.json `phase: 'aborted'`, `consensus.status: 'aborted'`. Write abort reason to `.agents/outputs/hive.md`. Stop.

### Step 8: Per-Stage Execution Loop

Update workflow-state.json: `phase: 'execution'`.

#### Step 8.1: Extract Stages

Read `.agents/outputs/hive-consensus.md` and extract the Stage Execution Plan JSON block. Each stage has: id, scope, files, budget, contract_tests, not_in_scope.

Also extract the contract artifact file list — these are FROZEN files that @dev cannot modify.

#### Step 8.2: Prepare Output Directories

```bash
mkdir -p .agents/outputs/dev .agents/outputs/reviews
```

#### Step 8.3: Execute Per-Stage Loop

Track: `failureCount = 0`, `maxFailures = 3`, `completedStages = []`.

For each stage, dispatch @dev then @reviewer sequentially:

```
// --- Dispatch @dev ---
Task({
  subagent_type: 'omt:dev',
  description: 'Implement: ' + stage.scope,
  prompt: `
    HIVE MODE — Per-Stage Dispatch

    You are @dev agent dispatched for stage execution.

    Stage ID: ${stageId}
    Stage Scope: ${stage.scope}
    Files: ${stage.files.join(', ')}
    Change Budget: ${stage.budget} implementation lines (max)
    Contract Tests to make GREEN: ${stage.contract_tests}
    NOT in Scope: ${stage.not_in_scope}

    Contract Artifact Files (FROZEN — DO NOT MODIFY):
    ${contractFiles.join('\n')}

    Requirements: Read .agents/outputs/pm.md
    Architecture: Read .agents/outputs/arch.md

    Output path: Write your stage report to .agents/outputs/dev/${stageId}.md
    Follow TDD methodology. @arch's contract test stubs are your RED starting point.
  `
})

// --- Dispatch @reviewer ---
Task({
  subagent_type: 'omt:reviewer',
  description: 'Review: ' + stage.scope,
  prompt: `
    HIVE MODE — Per-Stage Review

    You are @reviewer agent dispatched for stage review.

    Stage ID: ${stageId}
    Stage Scope: ${stage.scope}
    Change Budget: ${stage.budget} implementation lines
    Contract Artifact Files (must be UNCHANGED):
    ${contractFiles.join('\n')}

    Verify against:
    - Requirements in .agents/outputs/pm.md
    - Architecture in .agents/outputs/arch.md
    - Contract integrity (git diff on contract files must be empty)
    - Change budget compliance
    - Test coverage >= 80%

    Dev Report: Read .agents/outputs/dev/${stageId}.md for contract concerns and budget actuals.
    Output path: Write review report to .agents/outputs/reviews/${stageId}.md
    If review passes, create a git commit with Stage: ${stageId} trailer.
    Do NOT hand off to @pm — report back directly.
  `
})
```

After successful stage completion:
- Reset `failureCount = 0`
- Add to `completedStages`
- Update workflow-state.json: `execution.tasks_completed`, `execution.failure_count: 0`
- Append task record to `execution.tasks[]`

On stage failure:
- Increment `failureCount`
- Update workflow-state.json: `execution.failure_count`
- If `failureCount >= 3`: proceed to Step 8.4 (Escalation)
- Otherwise: retry the same stage

#### Step 8.4: Escalation (After 3 Consecutive Failures)

Update workflow-state.json: `phase: 'escalated'`.

Present escalation summary to the user using AskUserQuestion:

```
Execution paused after 3 consecutive failures.

**Progress**: {completed}/{total} stages completed
**Failed on**: {stage description}
**Error**: {error details}

**Completed**:
{list of completed stages}

**Remaining**:
{list of remaining stages}

**Recommended Actions**:
1. Review error details in .agents/outputs/dev/ (per-stage reports)
2. Fix the blocking issue manually
3. Re-run /omt to resume (or adjust the goal)
```

Options:
1. **View Details** — Show full error context
2. **Fix and Retry** — User will fix the issue, then retry
3. **Abort** — Stop execution entirely

Handle response:
- **View Details**: Read and display relevant dev/review reports, then re-ask
- **Fix and Retry**: Update `phase: 'execution'`, `execution.failure_count: 0`, resume at failed stage
- **Abort**: Update `phase: 'aborted'`, stop

### Step 9: Completion

Update workflow-state.json: `phase: 'completed'`.

Generate completion report and write to `.agents/outputs/hive.md`:

```markdown
# OMT Execution Report

**Goal**: {original goal}
**Started**: {timestamp}
**Completed**: {timestamp}
**Phase**: Completed

## Summary

All {N} stages implemented and committed.

## Planning Phase
- @pm: Requirements defined ({user stories count} user stories)
- @arch: Architecture designed ({file count} files planned)
- Consensus: Approved

## Execution Phase

| Stage | Scope | Budget | Actual | Status | Commit |
|-------|-------|--------|--------|--------|--------|
| stage-1 | {scope} | {budget} | {actual} | Committed | {sha} |
| stage-2 | {scope} | {budget} | {actual} | Committed | {sha} |
...

## Artifacts
- Goal: .agents/goal.md
- Requirements: .agents/outputs/pm.md
- Architecture: .agents/outputs/arch.md
- Consensus: .agents/outputs/hive-consensus.md
- Dev Reports: .agents/outputs/dev/stage-*.md
- Review Reports: .agents/outputs/reviews/stage-*.md
- This Report: .agents/outputs/hive.md

## Next Steps
- Review commits: `git log --oneline`
- Run full test suite
- Deploy if ready
```

Summarize the outcome to the user:
- If completed: Show stage count, commit count, and point to `.agents/outputs/hive.md`
- If aborted: Confirm abortion and explain what was produced
- If escalated: Show the escalation summary and suggested next steps

## Error Handling

### Workspace Not Initialized

```
.agents/ directory not found.

Run /init-agents first to initialize the agent workspace.
```

### Goal Too Vague

If goal is less than 10 characters:

```
Goal is too brief. Please provide more detail about what you want to build.

Example: /omt "Implement JWT-based authentication with refresh token rotation and role-based access control"
```

### Agent Dispatch Failure

If @pm, @arch, or @hive fails to produce output:
1. Check for error messages in the Task result
2. Report the failure to the user with context
3. Suggest: re-run with adjusted goal, or manually create the missing output

## Key Constraints

- **Single Human Interaction**: Only the consensus gate (Step 7) requires user input, plus resume detection and escalation
- **No Agent File Modifications**: @pm and @arch behavior is overridden via dispatch prompts, not by editing their .md files
- **Unified State**: Uses `.agents/.state/workflow-state.json` for all phases
- **3-Failure Escalation**: After 3 consecutive stage failures, /omt stops and asks the human
- **@reviewer Does NOT Hand Off to @pm**: In hive mode, @reviewer reports back to /omt, not to @pm
- **@hive Is Analysis Only**: @hive reads outputs and writes hive-consensus.md — it does not dispatch agents or interact with the user
