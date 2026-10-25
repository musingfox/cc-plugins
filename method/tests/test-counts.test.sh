#!/usr/bin/env bash
# The revert gate's control run reports what the suite said it ran, not just its
# exit code.
#
# An exit code cannot tell a green suite from one that skipped everything and
# exited 0 -- both look identical to every gate. The counts are quoted from the
# runner's own summary line rather than computed, because a per-runner parser is
# wrong for the next runner; when there is no count-shaped line the marker says
# so instead of inventing one.
#
#   - a runner that prints a summary  -> test_counts= quotes it (incl. bun's "47 pass")
#   - a silent runner                 -> test_counts=unparsed
#   - an all-skipped green suite      -> counts show the skips, exit code does not
#   - green: test_exit=0, test_counts=, then the last 15 log lines
#   - red:   test_exit=<n>, test_counts=, the last 30 lines and up to 10 failure markers
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"
. "$METHOD_TESTS_DIR/lib/repo.sh"

GATE="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)/revert-gate.sh"

# control CMD...: the gate over a repo whose control run is CMD -> GATE_OUT
control() {
  new_repo; write_runner; base_commit; add_effective; write_contracts "[$C1]"
  # the suite proper runs in the contract runs too; CMD only has to be the control
  gate_run bash -c "$1"
  drop_repo
}
counts_of() { sed -n 's/^test_counts=//p' <<<"$1" | tail -1; }

# ---- a runner that prints a summary: the numbers are quoted back ----

control 'echo "Tests: 24 passed, 0 failed"'
assert_contains "$(counts_of "$GATE_OUT")" "24 passed" "summary: passes are quoted"

control 'echo "  10 passing"; echo "  2 pending"'
c="$(counts_of "$GATE_OUT")"
assert_contains "$c" "10 passing" "mocha shape: passes are quoted"
assert_contains "$c" "2 pending" "mocha shape: pendings are quoted"

control 'echo "(pass) slugify > keeps ascii [0.1ms]"; echo ""; echo " 47 pass"; echo " 0 fail"; echo " 120 expect() calls"; echo "Ran 47 tests across 2 files. [52.00ms]"'
c="$(counts_of "$GATE_OUT")"
assert_contains "$c" "47 pass" "bun shape: passes are quoted"
assert_contains "$c" "0 fail" "bun shape: fails are quoted"

control 'echo "tests: 24, failed: 0"'
assert_contains "$(counts_of "$GATE_OUT")" "tests: 24, failed: 0" "run.sh shape: quoted as written"

# ---- the case the exit code cannot see: everything skipped, exit 0 ----

control 'echo "0 passed, 600 skipped"; exit 0'
assert_contains "$GATE_OUT" "test_exit=0" "all-skipped: the exit code still says green"
c="$(counts_of "$GATE_OUT")"
assert_contains "$c" "600 skipped" "all-skipped: the counts show what the exit code hides"
assert_contains "$c" "0 passed" "all-skipped: zero passes are visible"

# ---- a runner that prints no counts says so, it does not invent any ----

control 'echo "build complete"; exit 0'
assert_eq "unparsed" "$(counts_of "$GATE_OUT")" "silent runner: reports unparsed"

# ---- only the last few count lines are quoted: per-file lines come first ----

control 'for i in 1 2 3 4 5 6; do echo "file$i: 1 passed"; done; echo "6 passed"'
assert_eq "3" "$(counts_of "$GATE_OUT" | tr '|' '\n' | wc -l | tr -d ' ')" "many count lines: the last three win"
assert_contains "$(counts_of "$GATE_OUT")" "6 passed" "many count lines: the summary is among them"

# ---- the markers come first, in order, and the verdict is last ----

control 'echo hello; exit 0'
assert_eq "test_exit=0" "$(printf '%s\n' "$GATE_OUT" | sed -n 1p)" "order: test_exit= is the first line"
assert_eq "test_counts=unparsed" "$(printf '%s\n' "$GATE_OUT" | sed -n 2p)" "order: test_counts= is the second line"

# ---- green: the last 15 log lines; red: the last 30 plus failure markers ----

control 'for i in $(seq 1 40); do echo "line $i"; done; exit 0'
assert_contains "$GATE_OUT" "line 40" "green tail: the last line"
assert_contains "$GATE_OUT" "line 26" "green tail: 15 lines back"
absent=yes; case "$GATE_OUT" in *"line 25"$'\n'*) absent=no ;; esac
assert_eq "yes" "$absent" "green tail: no more than 15 lines"
marker=absent; case "$GATE_OUT" in *"failure markers"*) marker=present ;; esac
assert_eq "absent" "$marker" "green tail: no failure markers"
# the command never looks at the tree, so every contract run is green too
assert_eq "STAYS_GREEN C1" "$GATE_LAST" "green tail: the verdict still ends the output"

control 'for i in $(seq 1 60); do echo "line $i"; done; echo "FAIL: widget"; for i in $(seq 61 100); do echo "line $i"; done; exit 5'
assert_eq "TESTS_RED 5" "$GATE_LAST" "red: the verdict carries the control run's exit code"
assert_eq "3" "$GATE_RC" "red: exit 3"
assert_contains "$GATE_OUT" "test_exit=5" "red: test_exit="
assert_contains "$GATE_OUT" "line 100" "red tail: the last line"
assert_contains "$GATE_OUT" "line 71" "red tail: 30 lines back"
assert_contains "$GATE_OUT" "--- failure markers ---
FAIL: widget" "red: the failure marker line is pulled out of the log"

control 'for i in $(seq 1 30); do echo "FAIL case $i"; done; exit 1'
assert_eq "10" "$(printf '%s\n' "$GATE_OUT" | sed -n '/--- failure markers ---/,$p' | grep -c '^FAIL case')" "red: at most 10 marker lines"
