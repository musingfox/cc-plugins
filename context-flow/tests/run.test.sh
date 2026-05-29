#!/usr/bin/env bash
# Self-validation for the test harness itself (run.sh + lib/assert.sh).
# Discovered and executed by run.sh like any other *.test.sh.

. "$CF_TESTS_DIR/lib/assert.sh"

# Positive cases.
assert_eq "abc" "abc" "assert_eq matches equal strings"
assert_contains "hello world" "world" "assert_contains finds substring"
assert_exit 0 true "assert_exit captures success"
assert_exit 1 false "assert_exit captures failure"

# assert_json round-trips a real jq read.
tmp="$(mktemp)"
printf '{"status":"PASS","n":3}' > "$tmp"
assert_json "$tmp" '.status' "PASS" "assert_json reads a string field"
assert_json "$tmp" '.n' "3" "assert_json reads a numeric field"
rm -f "$tmp"

# Meta: a failing assertion must make a test file exit nonzero.
assert_exit 1 bash -c ". \"$CF_TESTS_DIR/lib/assert.sh\"; assert_eq 1 2" \
  "a failing assertion yields nonzero exit"

# Meta: a clean test file must exit zero.
assert_exit 0 bash -c ". \"$CF_TESTS_DIR/lib/assert.sh\"; assert_eq ok ok" \
  "a passing assertion yields zero exit"
