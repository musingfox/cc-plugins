---
name: hook-guard
description: >-
  Manage project hook-guard installation — set up, diagnose, or update Claude
  Code hooks, git pre-commit, and commit-msg scripts with security checks,
  code-quality gates, and CLAUDECODE skip logic. Triggers on "set up hooks",
  "configure pre-commit", "add linting hooks", "initialize hook-guard", "check
  hooks", "hook doctor", "verify hook setup", "troubleshoot hooks", "update
  hooks", "regenerate hooks", "sync hooks with current tools", or similar
  requests.
---

# Hook Guard

Dispatch by user intent:

- **Setup** — install is missing or user asks to set up / configure / initialize
- **Doctor** — user asks to check / diagnose / verify / troubleshoot
- **Update** — install exists and user asks to update / refresh / regenerate / sync

If ambiguous: if `.githooks/pre-commit` exists and `.claude/settings.local.json` has hook-guard hooks → default to Doctor; otherwise → Setup.

Read `references/settings.md` for the user-override schema (`.claude/hook-guard.local.md`) — applies to all three modes.

---

## Setup

Skip if the user only wants to edit existing hooks. If `jj`-native only (no `.git/`), abort — pre-commit hooks not supported.

1. **Detect** — follow `references/detection.md`. Collect: languages, toolchain, VCS, existing hooks, monorepo. If existing hooks found, ask merge / replace / abort.
2. **Recommend** — read `.claude/hook-guard.local.md` if present. Present summary grouped by: CC hooks (PostToolUse lint/format soft, PreToolUse test gate hard), pre-commit always-run (security / integrity / structure), pre-commit skippable (lint / format / test), commit-msg. Ask to confirm.
3. **Generate**:
   - `.githooks/pre-commit` from `references/pre-commit-checks.md` — only enabled checks, real tool commands substituted. `chmod +x`.
   - `.githooks/commit-msg` from `references/commit-msg.md` if enabled. `chmod +x`.
   - `.claude/settings.local.json` — merge (not overwrite) hooks + `env.CLAUDECODE=1` per `references/cc-hooks.md`.
   - Run `git config core.hooksPath .githooks`.
   - Ensure `.claude/*.local.md` gitignored.
4. **Summary** — files touched, onboarding cmd (`git config core.hooksPath .githooks`), mention Doctor / Update modes.

---

## Doctor

Run all checks, present a status table (✓ / ✗ / ⚠ / ℹ), then offer auto-fix for FAIL/WARN.

1. **`git config core.hooksPath`** — must equal `.githooks`. Unset = FAIL. Other = WARN.
2. **Hook files** — `.githooks/pre-commit` and (if conventional commits) `.githooks/commit-msg`: exist + executable.
3. **`.claude/settings.local.json`** — `hooks.PostToolUse` with Edit|Write matcher; `hooks.PreToolUse` with Bash matcher; `env.CLAUDECODE == "1"`.
4. **Tools** — grep pre-commit + CC hooks for tool names (ruff, eslint, prettier, gitleaks, jq, python3…); `command -v` each.
5. **CLAUDECODE skip** — `grep -q 'CLAUDECODE' .githooks/pre-commit`. Missing = WARN.
6. **Settings file** — validate `.claude/hook-guard.local.md` frontmatter (schema in `references/settings.md`); warn on unknown fields.
7. **(Optional) Dry-run** — offer to execute `.githooks/pre-commit` on current tree.

Output ends with `Result: N/M checks passed`.

Remediation:

| Issue | Fix |
|---|---|
| core.hooksPath not set | `git config core.hooksPath .githooks` |
| Hook not executable | `chmod +x .githooks/<file>` |
| Tool missing | Suggest platform install |
| CLAUDECODE skip / CC hooks missing | Re-run Setup |

---

## Update

1. **Verify install** — `.githooks/pre-commit` + hook-guard hooks in CC settings. Otherwise → Setup.
2. **Re-detect** — `references/detection.md`; read overrides from `.claude/hook-guard.local.md`.
3. **Diff** — parse existing pre-commit script + CC hooks; identify added / removed / changed tools or languages.
4. **Present** — diff-style summary; ask to confirm.
5. **Apply surgically**:
   - `.githooks/pre-commit`: replace only changed check-function bodies (canonical in `references/pre-commit-checks.md`); insert/remove checks in correct section; preserve structure, config vars, helpers.
   - `.claude/settings.local.json`: deep-merge; update only changed command strings; preserve unrelated settings.
   - Preserve user overrides throughout.
6. **Post-update** — summarize; suggest running Doctor.
