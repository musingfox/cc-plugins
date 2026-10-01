#!/usr/bin/env bash
# The README tells the user how to let parallel builders write /tmp worktrees without prompts.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

README="$CF_TESTS_DIR/../README.md"
body=$(cat "$README")

assert_contains "$body" "permissions.additionalDirectories" "T1 README names permissions.additionalDirectories"
assert_contains "$body" "/private/tmp" "T2 README lists /private/tmp"
assert_contains "$body" "/tmp/cf-" "T2b README says cf sessions live under /tmp/cf-*"
n=$(grep 'top-level' "$README" | grep -c 'additionalDirectories')
assert_eq "1" "$([ "$n" -ge 1 ] && echo 1 || echo 0)" "T3 a line says a top-level additionalDirectories has no effect"
