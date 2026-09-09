---
name: diagnose
description: >-
  Diagnose or debug. Also when something is broken, throwing, failing, or slow.
---

# Diagnose

Offer the diagnosis loop, then wait. Use AskUserQuestion before any worktree exists.

If there is no observed symptom, ask for it first. Do not open a worktree against a guess.

AskUserQuestion — "Run the full diagnosis loop? It works in its own worktree and hands back a branch with a failing test; it does not apply the fix."

- **Diagnose** — proceed. Read `${CLAUDE_PLUGIN_ROOT}/docs/method.md` and follow it. The HITL template path the method asks for is `${CLAUDE_PLUGIN_ROOT}/scripts/hitl-loop.template.sh`.
- **Just look** — answer from reading only. No worktree, no branch. Say plainly that no branch was produced.
