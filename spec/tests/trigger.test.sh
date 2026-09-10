#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=spec/skills/glossary/SKILL.md
[ -f "$skill" ] || fail "T1: missing $skill"

n=$(grep -c '^name: glossary$' "$skill" || true)
[ "$n" -eq 1 ] || fail "T1: expected name: glossary once, got $n"

fm=$(awk 'BEGIN{n=0} /^---$/{n++; next} n==1{print} n>=2{exit}' "$skill")
for w in CONTEXT.md overloaded conflicts; do
  n=$(printf '%s\n' "$fm" | grep -c "$w" || true)
  [ "$n" -ge 1 ] || fail "T2: frontmatter must mention $w"
done

n=$(grep -c 'disable-model-invocation' "$skill" || true)
[ "$n" -eq 0 ] || fail "T3: disable-model-invocation must be absent"

dir=$(basename "$(dirname "$skill")")
[ "$dir" = "glossary" ] || fail "T4: skill directory must be glossary, got $dir"
