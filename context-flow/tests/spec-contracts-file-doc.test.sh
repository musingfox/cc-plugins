#!/usr/bin/env bash
# Pins the Spec review's contracts file: cf.md passes contracts.json, and
# review.md runs every test case in it, review-added R<n> cases included.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CF_ROOT="$(cd "$CF_TESTS_DIR/.." && pwd)"
REVIEW="$CF_ROOT/agents/review.md"
CFMD="$CF_ROOT/commands/cf.md"

spec_block=$(awk '/Report path: \$SESSION\/review-spec.md/ {p=1} /^### Presenting Results/ {exit} p' "$CFMD")
spec_axis=$(awk '/^## Spec Axis/ {p=1} /^## Rules/ {exit} p' "$REVIEW")

# T1
assert_contains "$spec_block" '## Contracts file' "Spec dispatch has a ## Contracts file section"
assert_contains "$spec_block" '$SESSION/contracts.json' "Spec dispatch passes \$SESSION/contracts.json"

# T2
assert_contains "$spec_axis" '## Contracts file' "review.md Spec axis names ## Contracts file"
assert_contains "$spec_axis" 'R<n>' "review.md Spec axis runs review-added R<n> cases"

# T3
if bash "$CF_TESTS_DIR/review-two-axis.test.sh" >/dev/null; then
  assert_eq "ok" "ok" "review-two-axis.test.sh still ok"
else
  assert_eq "ok" "fail" "review-two-axis.test.sh still ok"
fi
