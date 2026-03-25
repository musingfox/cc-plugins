---
name: hook-guard-update
description: >-
  This skill should be used when the user asks to "update hooks",
  "refresh hook configuration", "sync hooks with current tools",
  "upgrade hooks", "hook-guard update", "regenerate hooks",
  "update pre-commit", "update Claude Code hooks",
  or wants to update their existing hook-guard setup after adding new tools,
  changing languages, or wanting the latest check implementations.
---

# Hook Guard Update

Update existing hook-guard installation by re-detecting the environment and applying changes.

## Workflow

### 1. Verify Existing Installation

Check that hook-guard is already set up:
- `.githooks/pre-commit` exists
- `.claude/settings.local.json` has hook-guard hooks

If not found, suggest running setup instead.

### 2. Re-detect Environment

Run the same detection as setup. Read these reference files from the setup skill:
- `skills/setup/references/detection.md` — detection matrix
- `skills/setup/references/settings.md` — settings schema and defaults

Detect: languages, toolchain, VCS, project structure.

### 3. Diff Analysis

Compare current detection results with what's currently installed:

**Read existing hooks and extract current configuration:**
- Parse `.githooks/pre-commit` for enabled checks and tool commands
- Parse `.claude/settings.local.json` for CC hook commands
- Read `.claude/hook-guard.local.md` for user overrides (read `skills/setup/references/settings.md` for schema)

**Identify changes:**
- New tools detected (e.g., added eslint to a project that only had prettier)
- Removed tools (e.g., switched from flake8 to ruff)
- New languages detected (e.g., added Python files to a JS project)
- Missing checks that should be enabled

### 4. Present Changes

Show a diff-style summary:

```
Hook Guard Update
═══════════════════════════════════════

  Changes detected:

  + ruff detected (new) → update lint/format commands
  - flake8 no longer configured → remove from hooks
  ~ pytest → pytest with coverage flag (pyproject.toml changed)

  Files to update:
    .githooks/pre-commit        (lint/format commands)
    .claude/settings.local.json (PostToolUse command)

  No changes needed:
    .githooks/commit-msg
    Security checks
    File integrity checks

═══════════════════════════════════════
```

### 5. Apply Updates

After user confirms, apply changes surgically — do not rewrite unchanged parts.

Read canonical implementations from the setup skill references:
- `skills/setup/references/pre-commit-checks.md` — check function implementations
- `skills/setup/references/cc-hooks.md` — Claude Code hooks patterns

**For `.githooks/pre-commit`:**
- Read the existing script
- Identify which check functions need updating (tool command changes)
- Replace only those function bodies with canonical implementations from `pre-commit-checks.md`
- If new checks need adding, insert them in the correct section (security / integrity / structure / skippable)
- Preserve the script structure, configuration variables, and helper functions

**For `.claude/settings.local.json`:**
- Read and parse existing JSON
- Update only the hook command strings that changed
- Deep-merge (do not overwrite unrelated settings)

**Preserve** user customizations from `.claude/hook-guard.local.md` throughout.

### 6. Post-Update

- Show summary of changes applied
- Suggest running doctor to verify everything works
