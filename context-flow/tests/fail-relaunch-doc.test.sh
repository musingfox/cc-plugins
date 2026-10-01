#!/usr/bin/env bash
# Pins cf.md's re-launch of a failed or partially replanned shard on the flow's
# current builder.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"

any_fail=$(awk '/^#### Any FAIL/ {p=1; next} p && /^####/ {exit} p' "$CFMD")
replan=$(awk '/^#### Any NEEDS_REPLAN/ {p=1; next} p && /^(####|###) / {exit} p' "$CFMD")

# T1
assert_contains "$any_fail" '--prepare-only' "Any FAIL re-launches on Claude through --prepare-only"
assert_contains "$any_fail" '§3.2' "Any FAIL points at the §3.2 round"

# T2
assert_eq "0" "$(printf '%s\n' "$any_fail" | grep -cF 'a FAIL means OMP infrastructure failure' || true)" \
  "Any FAIL no longer calls every FAIL an OMP failure"

# T3
assert_contains "$replan" '§3.2' "the partial-replan re-fan-out names §3.2"
assert_contains "$replan" '§3.6' "the partial-replan re-fan-out names §3.6"

# T4
assert_contains "$any_fail" 'Per-shard, per-round FAIL retry budget = 1' "the FAIL retry budget stays one"
