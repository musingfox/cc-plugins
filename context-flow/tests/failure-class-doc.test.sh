#!/usr/bin/env bash
# Pins cf.md's routing without an implement Failure Class, which no builder produces.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"

# T1
assert_eq "0" "$(grep -c 'Failure Class' "$CFMD" || true)" "cf.md has no Failure Class"

# T2
overview=$(awk '/^## Pipeline Overview/ {p=1; next} p && /^## / {exit} p' "$CFMD" | awk '/^```/ {n++; next} n == 1')
assert_contains "$overview" 'NEEDS_REPLAN → plan (partial replan, §3.4)' "the overview routes NEEDS_REPLAN to a partial replan"

# T3
row=$(grep -m1 '^| All implement contracts Unresolved' "$CFMD")
assert_contains "$row" '§3.4' "the all-Unresolved row routes per §3.4"
assert_contains "$row" 'incomplete-contracts' "the all-Unresolved row names incomplete-contracts"
