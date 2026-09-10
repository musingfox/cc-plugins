#!/usr/bin/env bash
# Pins the two-axis Phase 4 review split.

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

ROOT="$(cd "$CF_TESTS_DIR/../.." && pwd)"
REVIEW="$ROOT/context-flow/agents/review.md"
CFMD="$ROOT/context-flow/commands/cf.md"
PI_REVIEWER="$ROOT/pi-dispatch/agents/reviewer.md"

assert_ge1() {
  local n="$1" msg="$2"
  if [ "${n:-0}" -ge 1 ]; then
    assert_eq "ge1" "ge1" "$msg"
  else
    assert_eq ">=1" "$n" "$msg"
  fi
}

# IsolationPreserved T1
tools_line=$(grep -E '^tools:' "$REVIEW")
assert_eq "tools: Read, Write, Grep, Glob, Bash" "$tools_line" "review.md tools whitelist"

# IsolationPreserved T2
if grep -h '^tools:' "$PI_REVIEWER" "$REVIEW" | grep -qw Edit; then
  assert_eq "no-Edit" "has-Edit" "neither review seat lists Edit"
else
  assert_eq "no-Edit" "no-Edit" "neither review seat lists Edit"
fi

# IsolationPreserved T3
bt_line=$(grep -F 'builder transcript' "$REVIEW" | grep -F 'forbidden' || true)
if [ -n "$bt_line" ]; then
  assert_eq "ge1" "ge1" "builder transcript is forbidden"
else
  assert_eq "present" "absent" "builder transcript is forbidden"
fi

# IsolationPreserved T4
assert_ge1 "$(grep -cF 'model: opus' "$REVIEW" || true)" "review.md has model: opus"
assert_ge1 "$(grep -cF 'capability floor' "$REVIEW" || true)" "review.md has capability floor"
