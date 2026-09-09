#!/usr/bin/env bash
# Guard: the hand-off commit carries the test, the cause, and nothing else.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

range=$(awk '/^## Phase 6/,0' diagnose/docs/method.md)

n=$(printf '%s\n' "$range" | grep -c 'git show' || true)
[ "$n" -ge 1 ] || fail "T1: expected git show in Phase 6"

n=$(printf '%s\n' "$range" | grep -cF '[DEBUG-' || true)
[ "$n" -ge 1 ] || fail "T2: expected [DEBUG- assertion in Phase 6"

n=$(printf '%s\n' "$range" | grep -ci 'no longer reproduces' || true)
[ "$n" -eq 0 ] || fail "T3: post-fix 'no longer reproduces' must be gone"

n=$(printf '%s\n' "$range" | grep -ciE 'delete the (failing )?test' || true)
[ "$n" -eq 0 ] || fail "T4: must not delete the failing test"

n=$(printf '%s\n' "$range" | grep -ci 'commit message' || true)
[ "$n" -ge 1 ] || fail "T5: expected commit message to carry the cause"

debug_line=$(grep -nF '[DEBUG-' diagnose/docs/method.md | head -1 | cut -d: -f1)
p6_line=$(grep -n '^## Phase 6' diagnose/docs/method.md | head -1 | cut -d: -f1)
[ -n "$debug_line" ] && [ -n "$p6_line" ] && [ "$debug_line" -lt "$p6_line" ] \
  || fail "T6: [DEBUG- must be introduced before Phase 6 (debug=$debug_line p6=$p6_line)"

p3_line=$(grep -n '^## Phase 3' diagnose/docs/method.md | head -1 | cut -d: -f1)
[ -n "$p3_line" ] && [ "$p3_line" -lt "$p6_line" ] \
  || fail "T7: Phase 3 must precede Phase 6 (p3=$p3_line p6=$p6_line)"
