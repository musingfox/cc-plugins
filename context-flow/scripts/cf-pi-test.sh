#!/usr/bin/env bash
# Run the test command inside $WORK and emit bounded output.
# On pass: tail -15 of the test log (typically the summary).
# On fail: tail -30 plus up to 10 explicit FAIL/error marker lines.
# Full log lives at $TEST_LOG — orchestrator reads it on demand.
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

# Bounded foreground run. The runner gets its own session+process group so the
# deadline kills the whole tree, not just the top process. macOS ships no
# timeout(1), so this follows the plugin's existing perl idiom.
(
  cd "$WORK" && perl -MPOSIX -e '
    my $deadline = shift @ARGV;
    my $pid = fork();
    exit 127 unless defined $pid;
    if ($pid == 0) { POSIX::setsid(); exec { $ARGV[0] } @ARGV; exit 127; }
    my $waited = 0;
    while (1) {
      last if waitpid($pid, POSIX::WNOHANG()) == $pid;
      if ($waited >= $deadline) {
        kill("TERM", -$pid); sleep 2; kill("KILL", -$pid);
        waitpid($pid, 0);
        exit 124;
      }
      select(undef, undef, undef, 0.2);
      $waited += 0.2;
    }
    my $st = $?;
    exit($st & 127 ? 128 + ($st & 127) : $st >> 8);
  ' "$DEADLINE" "$@"
) < /dev/null > "$TEST_LOG" 2>&1
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

if [ "$TEST_EXIT" -eq 0 ]; then
  tail -15 "$TEST_LOG"
else
  tail -30 "$TEST_LOG"
  echo "--- failure markers ---"
  grep -m 10 -E '(FAIL|failed|error\[|panicked|AssertionError)' "$TEST_LOG" | head -c 3000 || true
fi

exit $TEST_EXIT
