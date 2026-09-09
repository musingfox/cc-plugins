#!/usr/bin/env bash
# Guard: typing the explicit name starts the loop with no confirmation step.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

frontmatter() {
  awk '/^---$/{n++;next} n==1' diagnose/skills/diagnose-now/SKILL.md
}

n=$(frontmatter | grep -c '^disable-model-invocation: true$' || true)
[ "$n" -eq 1 ] || fail "T1: expected disable-model-invocation: true in frontmatter, got $n"

n=$(frontmatter | grep -c '^name: diagnose-now$' || true)
[ "$n" -eq 1 ] || fail "T2: expected name: diagnose-now in frontmatter, got $n"

n=$(grep -c 'AskUserQuestion' diagnose/skills/diagnose-now/SKILL.md || true)
[ "$n" -eq 0 ] || fail "T3: expected no AskUserQuestion, got $n"

n=$(grep -cF '${CLAUDE_PLUGIN_ROOT}/docs/method.md' diagnose/skills/diagnose-now/SKILL.md || true)
[ "$n" -eq 1 ] || fail "T4: expected one method.md pointer, got $n"
