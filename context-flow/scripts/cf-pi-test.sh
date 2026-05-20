#!/usr/bin/env bash
# Run the test command inside $WORK and emit bounded output.
# On pass: tail -15 of the test log (typically the summary).
# On fail: tail -30 plus up to 10 explicit FAIL/error marker lines.
# Full log lives at $TEST_LOG — orchestrator reads it on demand.
#
# Usage:   cf-pi-test.sh SESSION TEST_CMD [TEST_CMD_ARGS...]
# Exit:    the test command's exit code

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

SESSION="$1"; shift
load_cf_pi_env "$SESSION"

(
  cd "$WORK" && "$@"
) > "$TEST_LOG" 2>&1
TEST_EXIT=$?
echo "test_exit=$TEST_EXIT"

if [ "$TEST_EXIT" -eq 0 ]; then
  tail -15 "$TEST_LOG"
else
  tail -30 "$TEST_LOG"
  echo "--- failure markers ---"
  grep -m 10 -E '(FAIL|failed|error\[|panicked|AssertionError)' "$TEST_LOG" | head -c 3000 || true
fi

exit $TEST_EXIT
