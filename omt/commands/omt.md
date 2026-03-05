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

#### VCS Detection

Detect the VCS environment (one-time check):

```bash
jj root 2>/dev/null && echo "USE_JJ=true" || echo "USE_JJ=false"
```

Store the result as `$USE_JJ` for use throughout the session. This determines how milestone commits are created.

### Step 2.5: Resume Detection

Check for existing output files to detect an interrupted session:

```
Resume detection:
1. Read .agents/goal.md for the original goal
2. Check output file existence:
   - .agents/outputs/pm.md → PM completed
   - .agents/outputs/arch.md → Arch completed
   - .agents/outputs/hive-consensus.md → Consensus analysis done
   - .agents/outputs/dev/stage-*.md → count completed dev stages
   - .agents/outputs/reviews/stage-*.md → count completed review stages
3. Determine re-entry point from file existence
```

If `.agents/goal.md` exists AND at least one output file exists, an interrupted session is detected. Use `AskUserQuestion` to present the situation:

```
Detected an interrupted OMT session.

Goal: {goal from goal.md}
Progress:
  - PM: {exists/missing}
  - Arch: {exists/missing}
  - Consensus: {exists/missing}
  - Dev stages: {count completed}
  - Review stages: {count completed}
```

Options:
1. **Resume** — Continue from where it left off (uses the original goal)
2. **Start Fresh** — Discard the previous session and start new with `$GOAL`
3. **Cancel** — Stop without doing anything

**Resume**: Determine re-entry point from file existence:

```
Re-entry logic:
1. If .agents/outputs/reviews/ has stage files AND .agents/outputs/dev/ has more stages:
   → Resume at Step 8 (Execution Loop), skip completed stages
2. If .agents/outputs/hive-consensus.md exists:
   → Resume at Step 8 (Execution Loop) — consensus was already approved
3. If .agents/outputs/arch.md exists:
   → Resume at Step 7 (Consensus Gate)
4. If .agents/outputs/pm.md exists:
   → Resume at Step 6 (Dispatch @arch)
5. Otherwise:
   → Resume at Step 5 (Dispatch @pm)

Use the ORIGINAL goal from .agents/goal.md, not $GOAL.
```

**Start Fresh**: Remove existing output files to reset:
```bash
rm -f .agents/goal.md
rm -rf .agents/outputs/
mkdir -p .agents/outputs .agents/outputs/dev .agents/outputs/reviews
```
Then proceed to Step 3 with `$GOAL`.

**Cancel**: Stop execution.

### Step 3: Ensure Output Directories

```bash
mkdir -p .agents/outputs .agents/outputs/dev .agents/outputs/reviews
```

### Step 4: Initialize

Write the goal file:

```
Write .agents/goal.md with the goal text.
```

**Milestone Commit**: Execute the Milestone Commit Protocol with:
- Message: `plan: initialize omt workspace for {goal summary}`
- Files: `.agents/goal.md`

### Step 5: Dispatch @pm (Autonomous Mode)

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
- If @pm fails or output is missing: report error to user, stop

**Milestone Commit**: Execute the Milestone Commit Protocol with:
- Message: `plan: define requirements for {goal summary}`
- Files: `.agents/outputs/pm.md`

### Step 6: Dispatch @arch (Autonomous Mode)

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

    Section 4: ACS Quality Gate

    Section 5: Stage Plan (L1)
      - Each stage: scope, files (max 5), completion gate, NOT in scope
      - Use vertical slice strategy (each stage = end-to-end functional slice)

    Section 6: Pseudocode for complex functions (auto-approved in hive mode)

    Also include: File plan (files to create/modify)

    Write the complete architecture to .agents/outputs/arch.md
  `
})
```

After @arch completes:
- Read `.agents/outputs/arch.md` to confirm it exists
- If @arch fails or output is missing: report error to user, stop

**Milestone Commit**: Execute the Milestone Commit Protocol with:
- Message: `plan: design architecture for {goal summary}`
- Files: `.agents/outputs/arch.md` + any contract artifact files created by @arch (type defs, test stubs listed in arch.md Section 1)

### Step 7: Consensus Gate (Single Human Interaction)

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

**Milestone Commit**: Execute the Milestone Commit Protocol with:
- Message: `plan: consensus analysis for {goal summary}`
- Files: `.agents/outputs/hive-consensus.md`

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

**Approve**:
- **Milestone Commit**: Execute the Milestone Commit Protocol with:
  - Message: `plan: approved execution plan for {goal summary}`
  - Files: Use `git commit --allow-empty` (git) or `jj describe` on current change (jj) — this is an approval marker, no new files
- Proceed to Step 8.

**Modify**:
- Read user's modification feedback
- Determine which agent(s) need re-running (@pm and/or @arch)
- Re-dispatch affected agent(s) with modifications included in the prompt
- Re-dispatch @hive for updated consensus analysis
- **Milestone Commit**: Execute the Milestone Commit Protocol with:
  - Message: `plan: revise {pm|arch|both} — {modification summary}`
  - Files: Affected output files (`.agents/outputs/pm.md`, `.agents/outputs/arch.md`, `.agents/outputs/hive-consensus.md`)
- Return to Step 7.2 to present updated consensus

**Abort**: Stop execution.

### Step 8: Per-Stage Execution Loop

#### Step 8.1: Extract Stages

Read `.agents/outputs/hive-consensus.md` and extract the Stage Execution Plan JSON block. Each stage has: id, scope, files, contract_tests, not_in_scope.

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
    Stage Files: ${stage.files.join(', ')}
    Contract Artifact Files (must be UNCHANGED):
    ${contractFiles.join('\n')}

    Verify against:
    - Requirements in .agents/outputs/pm.md
    - Architecture in .agents/outputs/arch.md
    - Contract integrity (git diff on contract files must be empty)
    - Scope adherence (only stage-plan files modified)
    - Test coverage >= 80%

    Dev Report: Read .agents/outputs/dev/${stageId}.md for context, decisions, and contract concerns.
    Output path: Write review report to .agents/outputs/reviews/${stageId}.md
    Do NOT create git commits — /omt orchestrator handles milestone commits.
    Do NOT hand off to @pm — report back directly.
  `
})
```

After @reviewer completes with APPROVE verdict:
- Verify `.agents/outputs/reviews/{stageId}.md` exists and contains "APPROVE"
- **Milestone Commit**: Execute the Milestone Commit Protocol with:
  - Message: `feat|fix|refactor(scope): {stage description}` (choose type based on stage content)
  - Files: Stage implementation files + `.agents/outputs/dev/${stageId}.md` + `.agents/outputs/reviews/${stageId}.md`
  - Additional trailers: `Stage: {stage-id}`, `Reviewed-By: @reviewer`
- Reset `failureCount = 0`
- Add to `completedStages` (in-memory tracking)

On stage failure:
- Increment `failureCount`
- If `failureCount >= 3`: proceed to Step 8.4 (Escalation)
- Otherwise: retry the same stage

#### Step 8.4: Escalation (After 3 Consecutive Failures)

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
- **Fix and Retry**: Reset `failureCount = 0`, resume at failed stage
- **Abort**: Stop execution

### Step 9: Completion

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

| Stage | Scope | Status | Commit |
|-------|-------|--------|--------|
| stage-1 | {scope} | Committed | {sha} |
| stage-2 | {scope} | Committed | {sha} |
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

## Milestone Commit Protocol

Every milestone step produces a git-visible commit (or jj equivalent). This protocol is referenced by each step below.

**Input**: `commit_message` (conventional commit format), `files_to_include` (list of paths)

```
If USE_JJ:
  1. jj squash                     # Collapse changes since last milestone
  2. jj describe -m "{commit_message}"
  3. jj new                        # Clean change for next phase
Else (git):
  1. git add {files_to_include}
  2. git commit using HEREDOC:
     {commit_message}

     Co-Authored-By: Claude <noreply@anthropic.com>
     Agent-Workflow: omt
  3. Verify: git status
```

**Commit Schedule**:

| Commit | After Step | Message Format | Files |
|--------|-----------|---------------|-------|
| 1 | Step 4 | `plan: initialize omt workspace for {goal summary}` | `.agents/goal.md` |
| 2 | Step 5 | `plan: define requirements for {goal summary}` | `.agents/outputs/pm.md` |
| 3 | Step 6 | `plan: design architecture for {goal summary}` | `.agents/outputs/arch.md` + contract artifact files |
| 4 | Step 7.1 | `plan: consensus analysis for {goal summary}` | `.agents/outputs/hive-consensus.md` |
| 5 | Step 7.3 Approve | `plan: approved execution plan for {goal summary}` | Empty commit (approval marker) — use `git commit --allow-empty` or `jj describe` on current change |
| 5+N | Step 7.3 Modify | `plan: revise {pm\|arch\|both} — {modification summary}` | Affected output files |
| 6+ | Step 8 per stage | `feat\|fix\|refactor(scope): {stage description}` | Stage files + `.agents/outputs/dev/{stageId}.md` + `.agents/outputs/reviews/{stageId}.md` |

**Stage commit trailers** (Step 8 only):
```
Stage: {stage-id}
Reviewed-By: @reviewer
```

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
- **File-Based Progress**: Tracks progress by output file existence, not state files
- **3-Failure Escalation**: After 3 consecutive stage failures, /omt stops and asks the human
- **@reviewer Does NOT Hand Off to @pm**: @reviewer reports back to /omt, not to @pm
- **@reviewer Does NOT Create Git Commits**: /omt orchestrator handles all milestone commits after review approval
- **@hive Is Analysis Only**: @hive reads outputs and writes hive-consensus.md — it does not dispatch agents or interact with the user
- **Dual-Track VCS**: In jj repos, agents create fine-grained jj changes (describe + new); /omt creates milestone commits via jj squash. In git-only repos, /omt creates git commits at each milestone.
