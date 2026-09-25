---
name: hook-guard
description: >-
  Set up, diagnose, or update a project's git pre-commit and commit-msg scripts, with
  security checks and code-quality gates that run for every committer, Claude Code
  included. Covers first-time installation, a "hook doctor" check on an existing setup,
  and regenerating hooks after the project's tooling changes.
---

# Hook Guard

Dispatch by user intent:

- **Setup** — install is missing or user asks to set up / configure / initialize
- **Doctor** — user asks to check / diagnose / verify / troubleshoot
- **Update** — install exists and user asks to update / refresh / regenerate / sync

If ambiguous: if `.githooks/pre-commit` exists → default to Doctor; otherwise → Setup.

Read `references/settings.md` for the user-override schema (`.claude/hook-guard.local.md`) — applies to all three modes.

---

## Setup

Skip if the user only wants to edit existing hooks. If `jj`-native only (no `.git/`), abort — pre-commit hooks not supported.

1. **Detect** — follow `references/detection.md`. Collect: languages, toolchain, VCS, existing hooks, monorepo. If existing hooks found, ask merge / replace / abort.
2. **Recommend** — read `.claude/hook-guard.local.md` if present. Present summary grouped by: pre-commit security / integrity / structure, pre-commit quality (lint / format / test), commit-msg. Ask to confirm.
3. **Generate**:
   - `.githooks/pre-commit` from `references/pre-commit-checks.md` — only enabled checks, real tool commands substituted. `chmod +x`.
   - `.githooks/commit-msg` from `references/commit-msg.md` if enabled. `chmod +x`.
   - Run `git config core.hooksPath .githooks`.
   - Ensure `.claude/*.local.md` gitignored.
4. **Summary** — files touched, onboarding cmd (`git config core.hooksPath .githooks`), mention Doctor / Update modes.

---

## Doctor

Run all checks, present a status table (✓ / ✗ / ⚠ / ℹ), then offer auto-fix for FAIL/WARN.

1. **`git config core.hooksPath`** — must equal `.githooks`. Unset = FAIL. Other = WARN.
2. **Hook files** — `.githooks/pre-commit` and (if conventional commits) `.githooks/commit-msg`: exist + executable.
3. **Legacy Claude skip** — older hook-guard installs skip lint / format / test when `CLAUDECODE` is set and hand them to `.claude/settings.local.json` hooks that read `$CLAUDE_TOOL_ARG_*`, a variable Claude Code never sets, so Claude's commits go unchecked. `grep -q 'CLAUDECODE' .githooks/pre-commit` or `grep -q 'CLAUDE_TOOL_ARG_' .claude/settings.local.json` = FAIL.
4. **Tools** — grep pre-commit for tool names (ruff, eslint, prettier, gitleaks, jq, python3…); `command -v` each.
5. **Settings file** — validate `.claude/hook-guard.local.md` frontmatter (schema in `references/settings.md`); warn on unknown fields.
6. **(Optional) Dry-run** — offer to execute `.githooks/pre-commit` on current tree.

Output ends with `Result: N/M checks passed`.

Remediation:

| Issue | Fix |
|---|---|
| core.hooksPath not set | `git config core.hooksPath .githooks` |
| Hook not executable | `chmod +x .githooks/<file>` |
| Tool missing | Suggest platform install |
| Legacy Claude skip | Delete the `SKIP_*` lines and their guards from pre-commit; delete those hooks and `env.CLAUDECODE` from `.claude/settings.local.json` |

---

## Update

1. **Verify install** — `.githooks/pre-commit` exists. Otherwise → Setup.
2. **Re-detect** — `references/detection.md`; read overrides from `.claude/hook-guard.local.md`.
3. **Diff** — parse existing pre-commit script; identify added / removed / changed tools or languages.
4. **Present** — diff-style summary; ask to confirm.
5. **Apply surgically**:
   - `.githooks/pre-commit`: replace only changed check-function bodies (canonical in `references/pre-commit-checks.md`); insert/remove checks in correct section; preserve structure, config vars, helpers.
   - Preserve user overrides throughout.
6. **Post-update** — summarize; suggest running Doctor.
