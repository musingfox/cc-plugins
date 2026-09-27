#!/usr/bin/env bash
# Pins the revert gate in every document that lists shard gates or
# NEEDS_REPLAN reasons.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CF_ROOT="$(cd "$CF_TESTS_DIR/.." && pwd)"
CFMD="$CF_ROOT/commands/cf.md"
DESIGN="$CF_ROOT/docs/parallel-sharded-design.md"
PROTOCOL="$CF_ROOT/docs/pi-implementer-protocol.md"
README="$CF_ROOT/README.md"

# T1
replan=$(awk '/^#### Any NEEDS_REPLAN/ {p=1; print; next} p && /^### / {exit} p' "$CFMD")
assert_contains "$replan" "tests-green-on-revert" "cf.md Any NEEDS_REPLAN names tests-green-on-revert"

# T2
row=$(grep -m1 '^| `NEEDS_REPLAN`' "$DESIGN")
assert_contains "$row" "reverted" "design NEEDS_REPLAN row names a reverted implementation"

# T3
validation=$(awk '/^## 6\./ {p=1; print; next} p && /^## 7\./ {exit} p' "$PROTOCOL")
assert_contains "$validation" "cf-pi-revert-gate.sh" "protocol §6 names cf-pi-revert-gate.sh"
assert_contains "$validation" "N+1" "protocol §6 names the N+1 cost"

# T4
feature=$(grep -m1 'Parallel sharded implementation' "$README")
assert_contains "$feature" "revert" "README sharded-implementation line names the revert check"
