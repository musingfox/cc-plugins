#!/usr/bin/env bash
# Guard: the run stops once a committed test is red on the bug.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

range=$(awk '/^## Phase 5/,/^## Phase 6/' diagnose/docs/method.md)

n=$(printf '%s\n' "$range" | grep -ci 'watch it fail' || true)
[ "$n" -ge 1 ] || fail "T1: expected watch it fail in Phase 5"

n=$(printf '%s\n' "$range" | grep -ci 'watch it pass' || true)
[ "$n" -eq 0 ] || fail "T2: watch it pass must not appear in Phase 5"

n=$(printf '%s\n' "$range" | grep -ci 'apply the fix' || true)
[ "$n" -eq 1 ] || fail "T3: expected exactly one apply-the-fix guardrail, got $n"

n=$(printf '%s\n' "$range" | grep -c '/cf' || true)
[ "$n" -ge 1 ] || fail "T4: expected /cf in Phase 5"

min_line=$(grep -n '^### Minimise$' diagnose/docs/method.md | head -1 | cut -d: -f1)
p5_line=$(grep -n '^## Phase 5' diagnose/docs/method.md | head -1 | cut -d: -f1)
[ -n "$min_line" ] && [ -n "$p5_line" ] && [ "$min_line" -lt "$p5_line" ] \
  || fail "T5: ### Minimise must precede Phase 5 (min=$min_line p5=$p5_line)"
