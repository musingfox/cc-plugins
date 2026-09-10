#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

ref=spec/skills/glossary/references/context-format.md
[ -f "$ref" ] || fail "missing $ref"

n=$(grep -cF '# {Context Name}' "$ref" || true)
[ "$n" -ge 1 ] || fail "T1: # {Context Name} missing"
n=$(grep -c '^## Language$' "$ref" || true)
[ "$n" -ge 1 ] || fail "T1: ## Language missing"
n=$(grep -cF '_Avoid_:' "$ref" || true)
[ "$n" -ge 1 ] || fail "T1: _Avoid_: missing"

for p in 'Be opinionated' 'Keep definitions tight' 'Only include terms specific' 'Group terms under subheadings'; do
  n=$(grep -cF "$p" "$ref" || true)
  [ "$n" -eq 1 ] || fail "T2: '$p' expected 1, got $n"
done

n=$(grep -c 'CONTEXT-MAP' "$ref" || true)
[ "$n" -eq 0 ] || fail "T3: CONTEXT-MAP must be absent"
n=$(grep -c '^## Relationships' "$ref" || true)
[ "$n" -eq 0 ] || fail "T3: ## Relationships must be absent"
n=$(grep -c 'Flagged ambiguities' "$ref" || true)
[ "$n" -eq 0 ] || fail "T3: Flagged ambiguities must be absent"

n=$(grep -cF '${CLAUDE_PLUGIN_ROOT}/skills/glossary/references/context-format.md' spec/skills/glossary/SKILL.md || true)
[ "$n" -eq 1 ] || fail "T4: SKILL.md must point at the format file once, got $n"
