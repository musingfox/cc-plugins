#!/usr/bin/env bash
# Guard: the automatic entry asks before any worktree exists.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=diagnose/skills/diagnose/SKILL.md
fm=$(awk '/^---$/{n++;next} n==1' "$skill")

n=$(printf '%s\n' "$fm" | grep -c '^name: diagnose$' || true)
[ "$n" -eq 1 ] || fail "T1: expected name: diagnose in frontmatter, got $n"

n=$(printf '%s\n' "$fm" | grep -c 'disable-model-invocation' || true)
[ "$n" -eq 0 ] || fail "T2: disable-model-invocation must be absent, got $n"

n=$(grep -c 'AskUserQuestion' "$skill" || true)
[ "$n" -ge 1 ] || fail "T3: expected AskUserQuestion, got $n"

n=$(grep -cF '${CLAUDE_PLUGIN_ROOT}/docs/method.md' "$skill" || true)
[ "$n" -eq 1 ] || fail "T4: expected one method.md pointer, got $n"

n=$(grep -cF '${CLAUDE_PLUGIN_ROOT}/scripts/hitl-loop.template.sh' "$skill" || true)
[ "$n" -eq 1 ] || fail "T5: expected one hitl-loop pointer, got $n"

n=$(grep -ci 'before any worktree' "$skill" || true)
[ "$n" -ge 1 ] || fail "T6: expected 'before any worktree', got $n"

n=$(grep -ci 'already consent' "$skill" || true)
[ "$n" -eq 0 ] || fail "T7: 'already consent' must be absent, got $n"

n=$(grep -ci 'skip the question' "$skill" || true)
[ "$n" -eq 0 ] || fail "T8: 'skip the question' must be absent, got $n"
