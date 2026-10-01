#!/usr/bin/env bash
# Pins when cf.md offers the OMP overflow: three triggers, only with pi available,
# never as a question at flow start.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"

s36=$(awk '/^### 3\.6/ {p=1; print; next} p && /^## / {exit} p' "$CFMD")
any_fail=$(awk '/^#### Any FAIL/ {p=1; next} p && /^####/ {exit} p' "$CFMD")

# T1
assert_contains "$s36" 'CF_IMPLEMENTER=omp' "§3.6 records the switch as CF_IMPLEMENTER=omp"
assert_contains "$s36" '$SESSION/env.sh' "§3.6 appends the switch to the session env"

# T2
assert_contains "$s36" 'Claude usage limit' "§3.6 lists the usage-limit trigger"
assert_contains "$s36" 'second FAIL' "§3.6 lists the second-FAIL trigger"
assert_contains "$s36" 'weekly' "§3.6 lists the raised-quota trigger"

# T3
assert_contains "$s36" 'PI_AVAILABLE=0' "§3.6 never offers OMP without pi"
assert_contains "$s36" 'flow start' "§3.6 never asks at flow start"

# T4
assert_contains "$s36" 'wait for the reset' "§3.6 offers waiting for the reset"
assert_contains "$s36" 'retry budget' "§3.6 does not count the limit against the retry budget"

# T5
assert_contains "$any_fail" 'rerun-on-omp' "Any FAIL's second-FAIL options include rerun-on-omp"

# T6
assert_contains "$s36" 'reviewer' "§3.6 keeps the reviewer-at-or-above-builder reminder"
