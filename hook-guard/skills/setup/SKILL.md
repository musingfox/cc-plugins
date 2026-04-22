---
name: hook-guard-setup
description: >-
  Set up hooks: detect project language/toolchain/VCS and generate git pre-commit,
  commit-msg, and Claude Code hooks with CLAUDECODE skip logic. Triggers on "set up
  hooks", "configure pre-commit", "add linting hooks", "initialize hook-guard",
  "configure Claude Code hooks", "add security checks to commits", "set up
  conventional commits", or similar requests to install commit hooks / code
  quality gates.
---

# Hook Guard Setup

Generate hook files after detecting project environment. Skip if user only wants to edit existing hooks or is asking about concepts — use doctor/update skills for those.

## Phase 1 — Detect

Read `references/detection.md`. Detect: languages, toolchain, VCS (git / jj-colocated / jj-native), existing hooks, monorepo. If existing hooks found, ask merge/replace/abort. If jj-native, abort (no hook support).

## Phase 2 — Recommend

Read `.claude/hook-guard.local.md` if present (schema in `references/settings.md`). Present summary grouped by:

- **CC hooks** (`.claude/settings.local.json`): PostToolUse lint/format (soft), PreToolUse test gate (hard)
- **Pre-commit always-run**: security, integrity, structure checks
- **Pre-commit skippable when CLAUDECODE=1**: lint, format, test
- **commit-msg**: conventional commits (if enabled)

Ask user to confirm/adjust.

## Phase 3 — Generate

- `.githooks/pre-commit` — from `references/pre-commit-checks.md`. Include only enabled checks; substitute real tool commands for lint/format/test. `chmod +x`.
- `.githooks/commit-msg` — from `references/commit-msg.md` if enabled. `chmod +x`.
- `.claude/settings.local.json` — merge (not overwrite) hooks + `env.CLAUDECODE=1` using patterns from `references/cc-hooks.md`.
- Run `git config core.hooksPath .githooks`.
- Ensure `.claude/*.local.md` is gitignored.

## Phase 4 — Summary

Report files touched, onboarding command (`git config core.hooksPath .githooks`), and point to doctor/update skills.
