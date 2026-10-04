#!/usr/bin/env bash
# Pins cf.md's builder selection: Claude cf:implement builds unless the session
# records CF_IMPLEMENTER=omp, whether or not pi is installed.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"

preflight=$(awk '/^### Implementer pre-flight/ {p=1; next} p && /^(---|##)/ {exit} p' "$CFMD")
registry=$(awk '/^## Agent Registry/ {p=1; next} p && /^###/ {exit} p' "$CFMD")
desc=$(sed -n 2p "$CFMD")

# T1
assert_contains "$desc" 'Use when' "description says when to use cf"
assert_eq "0" "$(printf '%s\n' "$desc" | grep -cE 'cf:implement|OMP' || true)" "description leaves builder internals to the body"

# T2
assert_contains "$preflight" 'CF_IMPLEMENTER' "pre-flight reads CF_IMPLEMENTER"
assert_eq "0" "$(printf '%s\n' "$preflight" | grep -F 'PI_AVAILABLE=1' | grep -cF '(default)' || true)" \
  "no pre-flight line makes PI_AVAILABLE=1 the default"

# T3
assert_contains "$preflight" 'Phase 3 will use Claude cf:implement' "pre-flight logs the Claude builder"

# T4
assert_contains "$preflight" 'AskUserQuestion' "pre-flight asks when omp is chosen without pi"
assert_contains "$preflight" 'CF_IMPLEMENTER=omp PI_DISPATCH_CMD=' "pre-flight re-runs setup with the OMP choice inline"

# T5
unset_line=$(printf '%s\n' "$preflight" | grep -F 'CF_IMPLEMENTER' | grep -F 'unset' || true)
assert_contains "$unset_line" 'unset' "an unset CF_IMPLEMENTER means Claude"

# T6
default_row=$(printf '%s\n' "$registry" | grep -F '(default)')
omp_row=$(printf '%s\n' "$registry" | grep '^|' | grep -F 'OMP')
assert_contains "$default_row" 'cf:implement' "the default registry row is cf:implement"
assert_contains "$omp_row" 'overflow' "the OMP registry row is the overflow"

# T7
assert_contains "$(cat "$CFMD")" '[implement — Claude default, OMP overflow]' "pipeline overview names both builders"
assert_contains "$(grep -m1 '^State to the human upfront' "$CFMD")" 'cf:implement' "Phase 3 opening names the builder"
