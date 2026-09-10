#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

skill=spec/skills/glossary/SKILL.md

for h in '### Stop on a conflict' '### One precise name' '### Concrete scenarios' '### Cross-check the code' '### Write back immediately'; do
  n=$(grep -c "^${h}$" "$skill" || true)
  [ "$n" -eq 1 ] || fail "T1: expected '$h' once, got $n"
done

got=$(grep -oE '^### (Stop on a conflict|One precise name|Concrete scenarios|Cross-check the code|Write back immediately)$' "$skill" | paste -s -d, -)
want='### Stop on a conflict,### One precise name,### Concrete scenarios,### Cross-check the code,### Write back immediately'
[ "$got" = "$want" ] || fail "T2: heading order was '$got'"

n=$(grep -c 'the moment it is resolved' "$skill" || true)
[ "$n" -ge 1 ] || fail "T3: the moment it is resolved missing"

n=$(grep -c 'Hard to reverse' "$skill" || true)
[ "$n" -eq 0 ] || fail "T4: Hard to reverse must be absent"
n=$(grep -c 'three conditions' "$skill" || true)
[ "$n" -eq 0 ] || fail "T4: three conditions must be absent"
