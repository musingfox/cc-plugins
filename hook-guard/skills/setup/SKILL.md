---
name: hook-guard-setup
description: >-
  This skill should be used when the user asks to "set up hooks",
  "configure pre-commit", "add linting hooks", "set up code quality checks",
  "initialize hook-guard", "add pre-commit hooks", "set up git hooks",
  "configure Claude Code hooks", "add security checks to commits",
  "set up conventional commits", "hook-guard setup", "hook guard setup",
  "add commit checks", "protect my commits", "configure git hooks for this repo",
  "I need a pre-commit hook", "help me set up code quality automation",
  or mentions setting up commit hooks, pre-commit scripts, or code quality gates.
  Detects project language/toolchain and generates Claude Code hooks, git pre-commit scripts,
  and CLAUDECODE skip logic.
---

# Hook Guard Setup

One-stop hook setup: detect project environment, recommend configuration, generate all hook files after user confirmation.

Do NOT use when:
- User is asking about hook concepts without wanting to set them up
- User wants to manually edit existing hooks (just help them directly)
- User is asking about hook-guard doctor or update (use those skills instead)

## Workflow

### Phase 1: Detect Environment

Run detection commands to identify the project context. Read `references/detection.md` for the full detection matrix.

Detect all of the following:
1. **Languages** — which languages are present (Python, JS/TS, Rust, Go, etc.)
2. **Toolchain** — which lint/format/test tools are installed and configured
3. **VCS** — git, jj (colocated), or jj (native)
4. **Existing hooks** — `.githooks/`, `.git/hooks/`, `core.hooksPath`, `.pre-commit-config.yaml`, `.claude/settings.local.json` hooks
5. **Project structure** — monorepo (multiple package manifests) or single project

If existing hooks are found, warn the user and ask how to proceed (merge, replace, or abort).

### Phase 2: Recommend Configuration

Present a summary table to the user with all checks grouped by category:

**A. Claude Code Hooks** (written to `.claude/settings.local.json`):
| Hook | Trigger | Tools | Mode |
|------|---------|-------|------|
| Lint | PostToolUse (Edit/Write) | [detected tools] | Soft feedback |
| Format | PostToolUse (Edit/Write) | [detected tools] | Soft feedback |
| Test gate | PreToolUse (Bash: git commit) | [detected tools] | Hard gate |

**B. Pre-commit Hooks — Always Run** (security, integrity, structure):
List each check with enabled/disabled status.

**C. Pre-commit Hooks — Skip when CLAUDECODE=1** (redundant with CC hooks):
- Lint, Format, Test

**D. Commit Message Hook**:
- Conventional commits validation (if enabled)

Read `references/cc-hooks.md` for Claude Code hooks patterns.
Read `references/pre-commit-checks.md` for all check implementations.
Read `references/commit-msg.md` for conventional commits validation.

Ask user to confirm or adjust the configuration before generating.

### Phase 3: Generate Files

After user confirmation, generate the following files:

#### 1. `.githooks/pre-commit`

Generate a self-contained bash script. Structure:
```
#!/usr/bin/env bash
set -euo pipefail

# CLAUDECODE skip logic
# Configuration variables
# Check functions (one per check)
# Run checks, collect results
# Summary and exit code
```

Use the check implementations from `references/pre-commit-checks.md`. Only include enabled checks.

Make executable: `chmod +x .githooks/pre-commit`

#### 2. `.githooks/commit-msg` (if conventional commits enabled)

Generate from `references/commit-msg.md`.

Make executable: `chmod +x .githooks/commit-msg`

#### 3. `.claude/settings.local.json` — Claude Code hooks

Read existing file if present and MERGE new hooks (do not overwrite existing settings).

Add hooks following patterns from `references/cc-hooks.md`.

Also add the environment variable for CLAUDECODE skip logic:
```json
{
  "env": {
    "CLAUDECODE": "1"
  }
}
```

#### 4. Git configuration

Run: `git config core.hooksPath .githooks`

If the project has a setup script or Makefile, suggest adding this command there for team onboarding.

#### 5. `.gitignore` updates (if needed)

Ensure `.claude/*.local.md` is gitignored if using hook-guard settings.

### Phase 4: Post-Setup Summary

After generation, display:
1. Files created/modified (with paths)
2. Team onboarding note: `git config core.hooksPath .githooks`
3. How to check status: mention the doctor skill
4. How to update later: mention the update skill

## Settings File

If `.claude/hook-guard.local.md` exists, read it for user overrides before Phase 2.

Read `references/settings.md` for the full schema, defaults, and how to apply overrides.
