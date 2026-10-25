#!/usr/bin/env bash
# Dependency-free test discovery runner for method shell scripts.
#
# Discovers every method/tests/*.test.sh, runs each in its own bash
# process, and reports TAP-ish lines. Exits 0 only if all test files pass.
#
# Wired as a test gate's TEST_RUNNER:
#     bash method/tests/run.sh
# revert-gate.sh reads the exit code and the test_exit= line below from its
# control run. Failing files print "not ok" / failing assertions print "  ✗ ".
#
# Exit: 0 = all passed, 1 = at least one test file failed.

set -uo pipefail

METHOD_TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export METHOD_TESTS_DIR

# Each test runs with a scrubbed environment. The scripts under test must not pick
# up the caller's GIT_*, METHOD_* or session variables, and the operator's
# PI_DISPATCH_CMD routing must not reach the fixtures. PI_REAL_GIT is the
# exception: inside a pi worker PATH starts with the git shim, which refuses to
# run without it. PI_CWD stays out, so the shim passes straight through.
KEEP=("METHOD_TESTS_DIR=$METHOD_TESTS_DIR")
for v in PATH HOME TMPDIR USER LOGNAME SHELL TERM LANG PI_REAL_GIT $(compgen -e | grep '^LC_'); do
  [ -n "${!v+x}" ] && KEEP+=("$v=${!v}")
done

shopt -s nullglob
total=0
failed=0

for f in "$METHOD_TESTS_DIR"/*.test.sh; do
  total=$((total + 1))
  name="$(basename "$f")"
  if env -i "${KEEP[@]}" bash "$f"; then
    echo "ok   - $name"
  else
    echo "not ok - $name"
    failed=$((failed + 1))
  fi
done

echo "---"
echo "tests: $total, failed: $failed"

rc=0
[ "$failed" -eq 0 ] || rc=1
echo "test_exit=$rc"
exit "$rc"
