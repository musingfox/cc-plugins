#!/usr/bin/env bash
# Pins the Spec review's repros sidecar: review.md says what to write, and
# cf.md names the path and clears last round's file before dispatching.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CF_ROOT="$(cd "$CF_TESTS_DIR/.." && pwd)"
REVIEW="$CF_ROOT/agents/review.md"
CFMD="$CF_ROOT/commands/cf.md"

spec_axis=$(awk '/^## Spec Axis/ {p=1} /^## Rules/ {exit} p' "$REVIEW")
phase4=$(awk '/^## Phase 4: Review/ {p=1} p {print} /^## Context Compression/ && p {exit}' "$CFMD")
spec_block=$(awk '/Report path: \$SESSION\/review-spec.md/ {p=1} /^### Presenting Results/ {exit} p' "$CFMD")

# T1
for token in 'Repros path:' '"repros"' '"contract"' '"given"' '"expect"' '"command"' '{"repros": []}'; do
  assert_contains "$spec_axis" "$token" "review.md Spec axis names $token"
done

# T2
assert_contains "$spec_axis" "not the observed behaviour" "a repro's expect quotes the contract, not the observed behaviour"

# T3
assert_contains "$spec_block" 'Repros path: $SESSION/review-repros.json' "Spec dispatch names the repros path"
rm_ln=$(printf '%s\n' "$phase4" | grep -n -F 'rm -f' | grep -m1 -F '$SESSION/review-repros.json' | cut -d: -f1)
agent_ln=$(printf '%s\n' "$phase4" | grep -n -m1 -F 'Agent(' | cut -d: -f1)
if [ -n "$rm_ln" ] && [ -n "$agent_ln" ] && [ "$rm_ln" -lt "$agent_ln" ]; then
  assert_eq "order" "order" "Phase 4 removes the old repros file before the first Agent("
else
  assert_eq "rm<agent" "$rm_ln,$agent_ln" "Phase 4 removes the old repros file before the first Agent("
fi

# T4
if bash "$CF_TESTS_DIR/review-two-axis.test.sh" >/dev/null; then
  assert_eq "ok" "ok" "review-two-axis.test.sh still ok"
else
  assert_eq "ok" "fail" "review-two-axis.test.sh still ok"
fi
