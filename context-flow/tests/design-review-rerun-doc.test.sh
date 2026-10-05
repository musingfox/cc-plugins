#!/usr/bin/env bash
# The design doc carries the review-FAIL re-run route and every contracts.json
# field the scripts read, so it does not contradict cf.md.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

DESIGN="$(cd "$CF_TESTS_DIR/.." && pwd)/docs/parallel-sharded-design.md"
section() { awk -v s="^## $1\\\\." '$0 ~ s {p=1; print; next} p && /^## [0-9]/ {exit} p' "$DESIGN"; }

assert_contains "$(section 1)" "Spec FAIL" "T1 §1 architecture shows the review FAIL re-run"
assert_contains "$(section 7)" "Spec FAIL" "T2 §7 names the review FAIL re-launch"
for field in depends test_files implementation_plan fuzzy_criteria; do
  assert_contains "$(section 2)" "\`$field\`" "T3 §2 lists contracts.json field $field"
done
