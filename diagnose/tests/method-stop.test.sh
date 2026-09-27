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

# The flip goes green only through the Phase 4 probe, which never reaches the commit.
flip=$(printf '%s\n' "$range" | grep -ni 'flip it:' || true)
[ -n "$flip" ] || fail "T6a: expected the flip step in Phase 5"
printf '%s\n' "$flip" | grep -qi 'neutralising change' || fail "T6b: the flip must re-make the Phase 4 neutralising change"
printf '%s\n' "$flip" | grep -qi 'discard' || fail "T6c: the flip must discard the neutralising change"
commit=$(printf '%s\n' "$range" | grep -ni 'commit the failing test' | head -1 | cut -d: -f1)
[ -n "$commit" ] && [ "${flip%%:*}" -lt "$commit" ] || fail "T6d: the flip must come before the commit"

min_line=$(grep -n '^### Minimise$' diagnose/docs/method.md | head -1 | cut -d: -f1)
p5_line=$(grep -n '^## Phase 5' diagnose/docs/method.md | head -1 | cut -d: -f1)
[ -n "$min_line" ] && [ -n "$p5_line" ] && [ "$min_line" -lt "$p5_line" ] \
  || fail "T5: ### Minimise must precede Phase 5 (min=$min_line p5=$p5_line)"
