---
name: diagnose-now
description: Start the diagnosis loop immediately and stop at a confirmed cause plus one failing test.
argument-hint: "<the observed symptom>"
disable-model-invocation: true
---

# Diagnose now

Typing this name is the confirmation. Do not ask whether to proceed.

If the target is not a git repository, stop before attempting a worktree and say so.

Treat `$ARGUMENTS` as the symptom when present. If none was supplied and the conversation has no observed symptom either, ask in plain prose what is broken. That is an input question, not permission to run. The symptom names the slug, so no worktree exists before it is known.

Then Read `${CLAUDE_PLUGIN_ROOT}/docs/method.md` and follow it from Phase 0 to the closing hand-off. The HITL template path is `${CLAUDE_PLUGIN_ROOT}/scripts/hitl-loop.template.sh`.
