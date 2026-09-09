---
name: diagnose-now
description: Start the diagnosis loop immediately and stop at a confirmed cause plus one failing test.
disable-model-invocation: true
---

# Diagnose now

Typing this name is the confirmation. Create the worktree first — do not ask whether to proceed.

If the target is not a git repository, stop before attempting a worktree and say so.

Treat `$ARGUMENTS` as the symptom when present. If none was supplied and the conversation has no observed symptom either, ask in plain prose what is broken. That is an input question, not permission to run.

Then Read `${CLAUDE_PLUGIN_ROOT}/docs/method.md` and follow it to the closing hand-off. The HITL template path is `${CLAUDE_PLUGIN_ROOT}/scripts/hitl-loop.template.sh`.
