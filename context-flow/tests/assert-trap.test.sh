#!/usr/bin/env bash
# assert.sh reports failures from its EXIT trap. A test that sets its own EXIT
# trap replaces it, so its failed assertions print ✗ and the file still exits 0.
# Such a test can never go red: clean up inline at the end, or chain
# _assert_summary_on_exit last in the new trap.

. "$CF_TESTS_DIR/lib/assert.sh"

for f in "$CF_TESTS_DIR"/*.test.sh; do
  grep -q 'lib/assert.sh' "$f" || continue
  assert_eq "" "$(grep -nE '^[[:space:]]*trap .*EXIT' "$f" | grep -v '_assert_summary_on_exit')" \
    "$(basename "$f") keeps assert.sh's EXIT trap"
done
