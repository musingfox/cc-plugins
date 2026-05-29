#!/usr/bin/env bash
# Dependency-free test discovery runner for context-flow shell scripts.
#
# Discovers every context-flow/tests/*.test.sh, runs each in its own bash
# process, and reports TAP-ish lines. Exits 0 only if all test files pass.
#
# Wired as the gate-3 / integration TEST_RUNNER:
#     TEST_RUNNER="bash context-flow/tests/run.sh"
# gate-3 invokes it via cf-pi-test.sh (which emits its own test_exit= marker);
# integration evals it directly and reads $?. We also print test_exit= here so
# the runner is self-describing when run standalone. Failing files print
# "not ok" / failing assertions print "  ✗ " — both match
# cf-pi-integrate.sh's failure-attribution grep.
#
# Exit: 0 = all passed, 1 = at least one test file failed.

set -uo pipefail

CF_TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CF_TESTS_DIR

shopt -s nullglob
total=0
failed=0

for f in "$CF_TESTS_DIR"/*.test.sh; do
  total=$((total + 1))
  name="$(basename "$f")"
  if bash "$f"; then
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
