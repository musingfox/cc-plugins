#!/usr/bin/env bash
# A cf:implement builder leaves no background work running when it replies.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

IMPLEMENT="$CF_TESTS_DIR/../agents/implement.md"

lower() { tr '[:upper:]' '[:lower:]'; }

n=$(lower < "$IMPLEMENT" | grep 'background' | grep -c 'before you reply')
assert_eq "1" "$([ "$n" -ge 1 ] && echo 1 || echo 0)" "T1 a line pairs background with before you reply"

n=$(grep 'run_in_background' "$IMPLEMENT" | grep -c '10 minutes')
assert_eq "1" "$([ "$n" -ge 1 ] && echo 1 || echo 0)" "T2 a line pairs run_in_background with 10 minutes"
