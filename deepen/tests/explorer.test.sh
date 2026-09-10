#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

f=deepen/agents/explorer.md
[ -f "$f" ] || fail "explorer.md missing"

fm=$(awk 'NR==1 && /^---$/{p=1} p{print} NR>1 && /^---$/{exit}' "$f")
printf '%s\n' "$fm" | grep -q '^name: explorer$' || fail "T1: name: explorer"
printf '%s\n' "$fm" | grep -q '^tools:' || fail "T1: tools: line missing"
printf '%s\n' "$fm" | grep '^tools:' | grep -q 'Write' || fail "T1: tools must contain Write"
printf '%s\n' "$fm" | grep '^tools:' | grep -q 'Read' || fail "T1: tools must contain Read"
if printf '%s\n' "$fm" | grep '^tools:' | grep -q 'Agent'; then
  fail "T1: tools must not contain Agent"
fi

n=$(grep -c 'Report path' "$f" || true)
[ "$n" -ge 1 ] || fail "T2: Report path, got $n"

for k in bouncing shallow-interface extracted-pure-function seam-leak hard-to-test; do
  n=$(grep -c "$k" "$f" || true)
  [ "$n" -ge 1 ] || fail "T3: '$k' missing"
done

for p in '## Summary' '## Friction' '## Notes' '- deletion test:' concentrates; do
  n=$(grep -cF -- "$p" "$f" || true)
  [ "$n" -ge 1 ] || fail "T4: '$p' missing"
done

n=$(grep -c 'scope not found' "$f" || true)
[ "$n" -ge 1 ] || fail "T5: scope not found, got $n"

n=$(grep -ci 'rigid heuristic' "$f" || true)
[ "$n" -ge 1 ] || fail "T6: rigid heuristic, got $n"

n=$(grep -ciE 'do not (edit|modify)' "$f" || true)
[ "$n" -ge 1 ] || fail "T7: do not edit/modify, got $n"
