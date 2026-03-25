---
name: hook-guard-doctor
description: >-
  This skill should be used when the user asks to "check hooks",
  "diagnose hook issues", "verify hook setup", "run hook doctor",
  "hook health check", "troubleshoot hooks", "are my hooks working",
  "hook-guard doctor", "check pre-commit status",
  or wants to verify that their hook configuration is correct and complete.
  Inspects hook files, permissions, tool availability, and configuration integrity.
---

# Hook Guard Doctor

Diagnose hook health: check all hook components are correctly installed and functional.

## Diagnostic Checklist

Run ALL of the following checks and present results as a status table.

### 1. Git Configuration

```bash
# Check core.hooksPath
git config core.hooksPath
```

- If set to `.githooks` → OK
- If set to something else → WARN (hooks may exist but not managed by hook-guard)
- If not set → FAIL (hooks in .githooks/ won't run)

### 2. Hook Files

Check these files exist and are executable:

```bash
# Pre-commit hook
test -f .githooks/pre-commit && test -x .githooks/pre-commit

# Commit-msg hook (if conventional commits enabled)
test -f .githooks/commit-msg && test -x .githooks/commit-msg
```

For each file:
- Exists + executable → OK
- Exists + not executable → WARN (run `chmod +x`)
- Missing → FAIL

### 3. Claude Code Hooks

Read `.claude/settings.local.json` and check:

- `hooks.PostToolUse` array exists with Edit/Write matcher → OK or MISSING
- `hooks.PreToolUse` array exists with Bash matcher (test gate) → OK or MISSING
- `env.CLAUDECODE` is set to `"1"` → OK or MISSING

### 4. Tool Availability

For each tool referenced in the hooks, verify it's installed:

```bash
command -v <tool> &>/dev/null
```

Check all tools mentioned in:
- Pre-commit script (grep for tool names: ruff, eslint, prettier, gitleaks, jq, python3, etc.)
- Claude Code hooks (grep the command strings)

Report: INSTALLED or MISSING for each tool.

### 5. CLAUDECODE Skip Logic

Verify the pre-commit script contains CLAUDECODE skip logic:

```bash
grep -q 'CLAUDECODE' .githooks/pre-commit
```

- Found → OK
- Missing → WARN (lint/format/test will run twice under Claude Code)

### 6. Settings File

Check for `.claude/hook-guard.local.md` (read `skills/setup/references/settings.md` for the expected schema):
- Exists → validate YAML frontmatter, warn on unknown fields, show summary of enabled/disabled checks
- Missing → INFO (using defaults, which is fine)

### 7. Hook Execution Test (Optional)

If user wants a deeper check, offer to run:

```bash
# Dry run the pre-commit hook
.githooks/pre-commit
```

This runs all checks against the current working tree (not staged changes, since nothing is staged during doctor).

## Output Format

Present results as a table:

```
Hook Guard Doctor
═══════════════════════════════════════

  core.hooksPath          ✓ .githooks
  .githooks/pre-commit    ✓ exists, executable
  .githooks/commit-msg    ✓ exists, executable
  CC hooks (PostToolUse)  ✓ lint + format on Edit/Write
  CC hooks (PreToolUse)   ✓ test gate on commit
  CC env.CLAUDECODE       ✓ set
  CLAUDECODE skip logic   ✓ present in pre-commit

  Tools:
    ruff                  ✓ installed (0.9.x)
    pytest                ✓ installed
    jq                    ✓ installed
    python3               ✓ installed

  Settings:               ✓ .claude/hook-guard.local.md found

═══════════════════════════════════════
  Result: 10/10 checks passed
```

Use ✓ for pass, ✗ for fail, ⚠ for warning, ℹ for info.

## Remediation

For each FAIL or WARN, suggest the fix:

| Issue | Fix |
|-------|-----|
| core.hooksPath not set | `git config core.hooksPath .githooks` |
| Hook not executable | `chmod +x .githooks/pre-commit` |
| Tool not installed | Suggest install command for the platform |
| CLAUDECODE skip missing | Re-run setup to regenerate |
| CC hooks missing | Re-run setup to regenerate |

Ask user if they want to auto-fix the issues found.
