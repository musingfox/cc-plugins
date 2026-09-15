#!/usr/bin/env bash
# Run the test command inside $WORK and emit bounded output.
# On pass: tail -15 of the test log (typically the summary).
# On fail: tail -30 plus up to 10 explicit FAIL/error marker lines.
# Full log lives at $TEST_LOG — orchestrator reads it on demand.
#
# Also emits test_counts=, because an exit code alone cannot tell a green suite
# from one that skipped everything and exited 0. The counts are quoted from
# whatever summary line the runner printed, never computed here: a per-runner
# parser would be wrong for the next runner. When no count-shaped line is
# present the marker says `unparsed` rather than inventing a number, and the
# caller surfaces that instead of reading silence as confirmation.
#
# Usage:   cf-pi-test.sh SESSION TEST_CMD [TEST_CMD_ARGS...]
# Exit:    the test command's exit code, or 124 when it outran the deadline
#
# The command gets /dev/null on stdin and a deadline. A suite that stops to read
# stdin, or one that spins, used to hang this script forever: nothing downstream
# bounds it (pi-poll's liveness guards watch the worker, not the gate), so the
# only backstop was the orchestrator's one-hour Monitor, and a shard sat there
# looking like progress the whole time.
#
# Env: CF_TEST_DEADLINE_S  seconds before the runner is group-killed (default 1800)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

SESSION="$1"; shift
load_cf_pi_env "$SESSION"

DEADLINE="${CF_TEST_DEADLINE_S:-1800}"

(
  cd "$WORK" && run_bounded "$DEADLINE" "$@"
) > "$TEST_LOG" 2>&1
TEST_EXIT=$?

# A stalled runner is not a red suite: re-dispatching the builder cannot fix a
# suite that never returns. Say so with its own marker and no test_exit, so the
# caller routes it as infrastructure rather than as a contract failure.
if [ "$TEST_EXIT" -eq 124 ]; then
  echo "test_stalled=$DEADLINE"
  tail -30 "$TEST_LOG"
  exit 124
fi

echo "test_exit=$TEST_EXIT"

# Quote the runner's own summary lines rather than recomputing them: whichever
# shape it prints ("24 passed, 0 failed", "10 passing" + "2 pending",
# "tests: 24, failed: 0") is reported as written. The LAST few matching lines
# win — runners print per-file lines before the summary.
COUNTS="$(grep -iE '[0-9]+ (passed|passing|failed|failing|skipped|pending|todo|ignored)|(tests|failures|passed|failed|skipped)[:=] ?[0-9]+' \
  "$TEST_LOG" 2>/dev/null | tail -3 | paste -sd'|' - | tr -s ' ' | cut -c1-240 || true)"
echo "test_counts=${COUNTS:-unparsed}"

if [ "$TEST_EXIT" -eq 0 ]; then
  tail -15 "$TEST_LOG"
else
  tail -30 "$TEST_LOG"
  echo "--- failure markers ---"
  grep -m 10 -E '(FAIL|failed|error\[|panicked|AssertionError)' "$TEST_LOG" | head -c 3000 || true
fi

exit $TEST_EXIT
