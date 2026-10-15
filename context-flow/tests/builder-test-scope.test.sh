#!/usr/bin/env bash
# Per-contract checks run the contract's own tests; the full runner runs once
# before the report. A suite with a browser probe takes minutes, and a builder
# running it after every contract spent most of a 49-minute shard on it.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

ROOT="$CF_TESTS_DIR/.."
methodology=$(sed -n '/<!-- METHODOLOGY-BEGIN -->/,/<!-- METHODOLOGY-END -->/p' "$ROOT/docs/pi-implementer-protocol.md")
brief_line=$(grep -F -- '**TEST_RUNNER**' "$ROOT/scripts/cf-pi-brief.sh")

assert_contains "$methodology" "run only the tests that cover it" "methodology: per-contract check is the contract's own tests"
assert_contains "$methodology" "Run the full test runner (named in Context Summary) once" "methodology: full runner once"
assert_eq "0" "$(printf '%s\n' "$methodology" | grep -c 'Run the test runner (named in Context Summary) after each contract')" "methodology: no full run per contract"
assert_contains "$brief_line" "once before your report" "brief: TEST_RUNNER line says once"
assert_eq "0" "$(printf '%s\n' "$brief_line" | grep -c 'after each contract')" "brief: TEST_RUNNER line drops per-contract full runs"
