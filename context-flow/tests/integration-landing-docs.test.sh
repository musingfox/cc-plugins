#!/usr/bin/env bash
# Pins cf.md's description of linear landing after the integration suite.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$(cd "$CF_TESTS_DIR/.." && pwd)/commands/cf.md"

assert_ge1() {
  local n="$1" msg="$2"
  if [ "${n:-0}" -ge 1 ]; then
    assert_eq "ge1" "ge1" "$msg"
  else
    assert_eq ">=1" "$n" "$msg"
  fi
}

phase4() {
  awk -v s='^## Phase 4: Review' -v e='^## Context Compression' \
    '$0 ~ s {p=1} p {print} $0 ~ e && p {exit}' "$CFMD"
}

# T1
assert_ge1 "$(grep -cF 'lands the same tree here as linear history' "$CFMD" || true)" \
  "cf.md: lands the same tree here as linear history"

# T2
assert_ge1 "$(grep -cF 'land the result on `cf/$CF_SLUG` as linear history' "$CFMD" || true)" \
  "cf.md: land the result on cf/\$CF_SLUG as linear history"

# T3
lc_line=$(grep -F 'INT_STATUS=LINEARIZE_CONFLICT' "$CFMD" || true)
assert_ge1 "$(printf '%s\n' "$lc_line" | grep -c . || true)" \
  "cf.md has INT_STATUS=LINEARIZE_CONFLICT"
assert_contains "$lc_line" ".integration_branch" \
  "LINEARIZE_CONFLICT line names .integration_branch"

# T4
assert_ge1 "$(grep -cF "already carries the integration gate's linear landing" "$CFMD" || true)" \
  "cf.md: already carries the integration gate's linear landing"

# T5
assert_eq "0" "$(grep -cF 'merges them back here' "$CFMD" || true)" \
  "cf.md does not say merges them back here"

# T6
assert_eq "0" "$(grep -cF 'written by the integration gate' "$CFMD" || true)" \
  "cf.md does not say written by the integration gate"

# T7 — do not call the suite runner from this file; Phase 4 stays byte-identical
if bash "$CF_TESTS_DIR/review-two-axis.test.sh"; then
  assert_eq "ok" "ok" "review-two-axis.test.sh still ok"
else
  assert_eq "ok" "fail" "review-two-axis.test.sh still ok"
fi
got=$(phase4 | shasum -a 256 | awk '{print $1}')
assert_eq "7a0bf82316321bf00fa43ab164c0d09e7fd5d77c508a09839d2754101bcc6795" "$got" \
  "Phase 4 section is byte-identical"
