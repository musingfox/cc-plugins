#!/usr/bin/env bash
# Pins the shard-gate comments: the runner string runs through `bash -c`.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS_DIR="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
RUN="$SCRIPTS_DIR/cf-pi-run.sh"
GATE="$SCRIPTS_DIR/cf-pi-revert-gate.sh"

# D1
assert_eq "0" "$(grep -c 'intentionally word-split' "$RUN")" "D1 cf-pi-run.sh no longer says word-split"

# D2
step9=$(sed -n '/^# -------- 9\./,/^run_gate3()/p' "$RUN")
assert_contains "$step9" 'bash -c' "D2 step-9 comment names bash -c"

# D3, D4
header=$(sed -n '1,/^set -euo pipefail/p' "$GATE")
assert_contains "$header" 'bash -c "$TEST_RUNNER"' "D3 revert gate header notes bash -c"
assert_contains "$header" 'cf-pi-revert-gate.sh SHARD_SESSION TEST_CMD [ARGS...]' "D4 usage line keeps the argv form"
