#!/usr/bin/env bash
# Run the test command inside $WORK and emit bounded output.
# On pass: tail -15 of the test log (typically the summary).
# On fail: tail -30 plus up to 10 explicit FAIL/error marker lines.
# Full log lives at $SESSION/test-output.log — orchestrator reads it on demand.
#
# Usage:   cf-pi-test.sh SESSION TEST_CMD [TEST_CMD_ARGS...]
# Exit:    the test command's exit code

# shellcheck source=/dev/null
SESSION="$1"; shift
. "$SESSION/env.sh"

(
  cd "$WORK" && "$@"
) > "$SESSION/test-output.log" 2>&1
TEST_EXIT=$?
echo "test_exit=$TEST_EXIT"

if [ "$TEST_EXIT" -eq 0 ]; then
  tail -15 "$SESSION/test-output.log"
else
  tail -30 "$SESSION/test-output.log"
  echo "--- failure markers ---"
  grep -m 10 -E '(FAIL|failed|error\[|panicked|AssertionError)' "$SESSION/test-output.log" | head -c 3000 || true
fi

exit $TEST_EXIT
