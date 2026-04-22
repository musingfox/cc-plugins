---
name: hook-guard-update
description: >-
  Update existing hook-guard installation after toolchain/language changes.
  Triggers on "update hooks", "refresh hook configuration", "sync hooks with
  current tools", "regenerate hooks", "hook-guard update", or similar.
---

# Hook Guard Update

Re-detect environment and apply surgical changes to existing hook-guard install.

## Steps

1. **Verify install** — `.githooks/pre-commit` exists and `.claude/settings.local.json` has hook-guard hooks. Otherwise suggest setup.
2. **Re-detect** — reuse `skills/setup/references/detection.md`. Read overrides from `.claude/hook-guard.local.md` (schema: `skills/setup/references/settings.md`).
3. **Diff** — parse existing pre-commit script and CC hooks to extract current tool commands. Identify added / removed / changed tools and languages.
4. **Present** — diff-style summary of changes and files to touch. Ask user to confirm.
5. **Apply surgically**:
   - `.githooks/pre-commit`: replace only changed check-function bodies (canonical impls in `skills/setup/references/pre-commit-checks.md`); insert/remove checks in correct section; preserve structure, config vars, helpers.
   - `.claude/settings.local.json`: deep-merge; update only changed command strings; preserve unrelated settings.
   - Preserve user overrides from `.claude/hook-guard.local.md` throughout.
6. **Post-update** — summarize changes; suggest running doctor.
