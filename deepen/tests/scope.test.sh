#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

f=deepen/skills/survey/SKILL.md
[ -f "$f" ] || fail "SKILL.md missing"

fm=$(awk 'NR==1 && /^---$/{p=1} p{print} NR>1 && /^---$/{exit}' "$f")
printf '%s\n' "$fm" | grep -q '^name: survey$' || fail "T1: name: survey"
printf '%s\n' "$fm" | grep -q '^disable-model-invocation: true$' || fail "T1: disable-model-invocation: true"
n=$(grep -c '^context:' "$f" || true)
[ "$n" -eq 0 ] || fail "T1: context: must be 0, got $n"

n=$(grep -c '\$ARGUMENTS' "$f" || true)
[ "$n" -ge 1 ] || fail "T2: \$ARGUMENTS, got $n"

for p in 'hotspots.sh' 'scope: wide' 'scope: hotspot'; do
  n=$(grep -c "$p" "$f" || true)
  [ "$n" -ge 1 ] || fail "T3: '$p' missing"
done

n=$(grep -c 'CONTEXT.md' "$f" || true)
[ "$n" -ge 1 ] || fail "T4: CONTEXT.md, got $n"
n=$(grep -c 'docs/adr/' "$f" || true)
[ "$n" -ge 1 ] || fail "T4: docs/adr/, got $n"

n=$(grep -c 'not a git repository' "$f" || true)
[ "$n" -ge 1 ] || fail "T5: not a git repository, got $n"

n=$(grep -c 'repository root' "$f" || true)
[ "$n" -ge 1 ] || fail "T6: repository root, got $n"

n=$(grep -c 'whole tree' "$f" || true)
[ "$n" -ge 1 ] || fail "T7: whole tree, got $n"
