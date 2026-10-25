#!/usr/bin/env bash
# The revert gate's control run is bounded: stdin is /dev/null and the command
# has a deadline. Without both, a suite that reads stdin or spins hangs the gate
# forever -- nothing downstream bounds it.
#
#   - a command that reads stdin gets EOF instead of blocking
#   - a control run that outruns CF_TEST_DEADLINE_S is group-killed; the verdict
#     is TESTS_STALLED <seconds>, exit 124, and no contract run happens
#   - a command that exits 124 BY ITSELF (a suite wrapping itself in timeout(1))
#     is a red suite, TESTS_RED 124, not a stall
#   - the whole process tree dies with it, not just the top process
#   - the supervisor prints nothing into the log, so a stall's tail is the
#     suite's last output
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/repo.sh"

GATE="$(cd "$CF_TESTS_DIR/../scripts" && pwd)/cf-revert-gate.sh"

# fixture: C1 effective, so that a green control run would end in CLEAN 1
fixture() { new_repo; write_runner; base_commit; add_effective; write_contracts "[$C1]"; }

# ---- stdin is /dev/null, not the caller's terminal ----

fixture
printf '%s\n' 'read -r line; echo "read rc=$?"' 'bash run-tests.sh' >"$REPO_TOP/stdin.sh"
GATE_OUT="$(CF_TEST_DEADLINE_S=30 bash "$GATE" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" -- bash "$REPO_TOP/stdin.sh" 2>/dev/null < <(sleep 10))"
GATE_RC=$?
assert_eq "0" "$GATE_RC" "stdin: a command that reads stdin still exits"
assert_contains "$GATE_OUT" "test_exit=0" "stdin: the exit marker is still printed"
assert_contains "$(cat "$OUT/revert-gate.log")" "read rc=1" "stdin: the read hit end of file at once"
drop_repo

# ---- a control run that outruns the deadline is killed and reported as stalled ----

fixture
start=$(date +%s)
CF_TEST_DEADLINE_S=1 gate_run sleep 30
elapsed=$(( $(date +%s) - start ))
assert_eq "124" "$GATE_RC" "deadline: a control run past its deadline exits 124"
assert_eq "TESTS_STALLED 1" "$GATE_LAST" "deadline: the verdict names the deadline in seconds"
verdict=late; [ "$elapsed" -lt 15 ] && verdict=prompt
assert_eq "prompt" "$verdict" "deadline: killed near the deadline, not after the command's own run (${elapsed}s)"
marker=absent; case "$GATE_OUT" in *test_exit=*) marker=present ;; esac
assert_eq "absent" "$marker" "deadline: a stall is not a red suite, so no test_exit= marker"
assert_eq "1" "$(grep -c '^### ' "$OUT/revert-gate.log")" "deadline: no contract run follows a stalled control run"
drop_repo

# ---- a stall's tail quotes the suite's last output, not the supervisor ----
# The supervisor shares the log. If it prints anything while writing the stall
# mark, that line becomes the tail and every stall quotes it instead of where
# the suite stopped.

fixture
CF_TEST_DEADLINE_S=1 gate_run bash -c 'echo "suite stopped here"; sleep 30'
assert_eq "TESTS_STALLED 1" "$GATE_LAST" "stall tail: stalled"
assert_eq "suite stopped here" "$(printf '%s\n' "$GATE_OUT" | tail -2 | head -1)" "stall tail: the line before the verdict is the suite's last output"
assert_eq "### control
suite stopped here
exit=124" "$(cat "$OUT/revert-gate.log")" "stall tail: the log holds the suite's output and the gate's exit line only"
drop_repo

# ---- a runner's own 124 is a red suite, not a stall ----
# `timeout 600 npm test` is an ordinary runner. Routing its timeout as
# infrastructure would call a red suite a hang.

fixture
gate_run bash -c 'exit 124'
assert_eq "3" "$GATE_RC" "self-124: a red control run exits 3"
assert_eq "TESTS_RED 124" "$GATE_LAST" "self-124: the runner's own exit code is the verdict's number"
assert_contains "$GATE_OUT" "test_exit=124" "self-124: reported as a red suite"
marker=absent; case "$GATE_OUT" in *TESTS_STALLED*) marker=present ;; esac
assert_eq "absent" "$marker" "self-124: not reported as a stall"
drop_repo

# ---- the deadline kills the whole process tree, not just the top process ----

fixture
MARK="$REPO_TOP/grandchild-alive"
CF_TEST_DEADLINE_S=1 gate_run bash -c "bash -c 'sleep 30; : > \"$MARK\"' & wait"
sleep 4
grandchild=dead; [ -f "$MARK" ] && grandchild=alive
assert_eq "dead" "$grandchild" "tree kill: the whole process group went down with the deadline"
drop_repo

# ---- the deadline applies to every contract run, and a killed run is red ----

fixture
printf '%s\n' '[ -f src/add.sh ] || sleep 30' 'exit 0' >"$REPO/tests/add.test.sh"
commit_all slow-when-reverted
start=$(date +%s)
CF_TEST_DEADLINE_S=2 gate_run bash run-tests.sh
elapsed=$(( $(date +%s) - start ))
assert_eq "CLEAN 1" "$GATE_LAST" "contract deadline: the killed run counts as red"
assert_contains "$(cat "$OUT/revert-gate.log")" "exit=124" "contract deadline: the log records the kill"
pace=late; [ "$elapsed" -lt 20 ] && pace=prompt
assert_eq "prompt" "$pace" "contract deadline: returned in ${elapsed}s"
drop_repo

# ---- the default deadline is 1800 seconds; a bad value is an input error ----

fixture
CF_TEST_DEADLINE_S=soon gate_run bash run-tests.sh
assert_eq "ERROR bad-deadline" "$GATE_OUT" "bad deadline: one ERROR line"
assert_eq "1" "$GATE_RC" "bad deadline: exit"
CF_TEST_DEADLINE_S=0 gate_run bash run-tests.sh
assert_eq "ERROR bad-deadline" "$GATE_OUT" "zero deadline: one ERROR line"
assert_eq "1800" "$(sed -n 's/^DEADLINE="\${CF_TEST_DEADLINE_S:-\([0-9]*\)}"$/\1/p' "$GATE")" "default deadline is 1800"
drop_repo
