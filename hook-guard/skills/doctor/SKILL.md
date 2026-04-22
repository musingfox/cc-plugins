---
name: hook-guard-doctor
description: >-
  Diagnose hook-guard installation health. Triggers on "check hooks", "diagnose
  hook issues", "verify hook setup", "hook health check", "troubleshoot hooks",
  "are my hooks working", "hook-guard doctor", or similar requests to verify
  hook configuration is correct.
---

# Hook Guard Doctor

Run all checks below, present a status table, then offer auto-fix for FAIL/WARN.

## Checks

1. **`git config core.hooksPath`** — must equal `.githooks`. Unset = FAIL. Other value = WARN.
2. **Hook files** — `.githooks/pre-commit` and (if conventional commits) `.githooks/commit-msg`: exists + executable.
3. **`.claude/settings.local.json`** — `hooks.PostToolUse` with Edit|Write matcher; `hooks.PreToolUse` with Bash matcher; `env.CLAUDECODE == "1"`.
4. **Tool availability** — grep pre-commit and CC hooks for tool names (ruff, eslint, prettier, gitleaks, jq, python3, etc.); `command -v` each.
5. **CLAUDECODE skip logic** — `grep -q 'CLAUDECODE' .githooks/pre-commit`. Missing = WARN (lint/format/test runs twice).
6. **Settings file** — `.claude/hook-guard.local.md`: if exists validate YAML frontmatter against schema in `skills/setup/references/settings.md`; warn on unknown fields.
7. **(Optional) Dry-run** — offer to execute `.githooks/pre-commit` against current working tree.

## Output

Table with ✓ / ✗ / ⚠ / ℹ per item. Final line: `Result: N/M checks passed`.

## Remediation

| Issue | Fix |
|-------|-----|
| core.hooksPath not set | `git config core.hooksPath .githooks` |
| Hook not executable | `chmod +x .githooks/<file>` |
| Tool missing | Suggest platform install command |
| CLAUDECODE skip / CC hooks missing | Re-run setup |
