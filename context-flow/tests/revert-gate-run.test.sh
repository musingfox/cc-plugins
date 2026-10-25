#!/usr/bin/env bash
# A builder's work is promoted only when every contract's tests go red with its
# own implementation reverted. The revert gate's verdict lines and exit codes,
# one fixture per verdict, through the CLI a caller consumes.
#
#   CLEAN <n> 0 | STAYS_GREEN <A>[,<B>...] 2 | TESTS_RED <test_exit> 3
#   TESTS_STALLED <seconds> 124 | ERROR <reason> 1
# The last stdout line is exactly one verdict. C1 is effective, C2 vacuous.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/repo.sh"

GATE="$(cd "$CF_TESTS_DIR/../scripts" && pwd)/cf-revert-gate.sh"

# verdict_lines: how many stdout lines are verdicts
verdict_lines() {
  printf '%s\n' "$GATE_OUT" | grep -cE '^(CLEAN [0-9]+|STAYS_GREEN .+|TESTS_RED [0-9]+|TESTS_STALLED [0-9]+|ERROR .+)$'
}

# mutant PERL_SUBSTITUTION -> MUT, a copy of the gate with that one change.
mutant() {
  mkdir -p "$REPO_TOP/mut"
  MUT="$REPO_TOP/mut/cf-revert-gate.sh"
  perl -0777 -pe "$1" "$GATE" >"$MUT"
  local applied=yes
  cmp -s "$GATE" "$MUT" && applied=no
  assert_eq "yes" "$applied" "mutation applies: $1"
}

# ==== a contract green without its implementation blocks promotion ====

# T1: vacuous C2
new_repo; write_runner; base_commit; add_vacuous
write_contracts "[$C2]"
gate_run bash run-tests.sh
assert_eq "2" "$GATE_RC" "T1 vacuous: exit"
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T1 vacuous: verdict is the last line"
assert_eq "1" "$(verdict_lines)" "T1 vacuous: exactly one verdict line"
assert_eq "control,C2" "$(grep '^### ' "$OUT/revert-gate.log" | sed 's/^### //' | paste -sd, -)" "T1 vacuous: log sections"
# the gate works in its own worktree, so DIR's own paths are never reverted there
assert_eq "" "$(git -C "$REPO" status --porcelain -- src tests)" "T1 own paths in DIR untouched"
drop_repo

# T2: effective C1 passes the gate, vacuous C2 is the only one named
new_repo; write_runner; base_commit; add_effective; add_vacuous
write_contracts "[$C1,$C2]"
gate_run bash run-tests.sh
assert_eq "2" "$GATE_RC" "T2 mixed: exit"
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T2 mixed: only C2 is named"
drop_repo

# T3: effective C1 alone is clean
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
gate_run bash run-tests.sh
assert_eq "0" "$GATE_RC" "T3 effective: exit"
assert_eq "CLEAN 1" "$GATE_LAST" "T3 effective: verdict"
assert_eq "1" "$(verdict_lines)" "T3 effective: exactly one verdict line"
drop_repo

# T4: a builder whose commits changed no file but whose contract is declared (a
# range with no commit at all is `ERROR empty-range`, see empty-range.test.sh)
new_repo; write_runner; base_commit
write_contracts "[$C1]"
git -C "$REPO" commit -q --allow-empty -m "no files"
assert_eq "1" "$(git -C "$REPO" rev-list --count "$BASE..HEAD")" "T4 fixture has one commit beyond base, changing no file"
gate_run bash run-tests.sh
assert_eq "2" "$GATE_RC" "T4 empty range: exit"
assert_eq "STAYS_GREEN C1" "$GATE_LAST" "T4 empty range: verdict"
drop_repo

# T5: no contracts at all: the control run happens, nothing is red or green
new_repo; write_runner; base_commit; add_effective
write_contracts '[]'
gate_run bash run-tests.sh
assert_eq "0" "$GATE_RC" "T5 no contracts: exit"
assert_eq "CLEAN 0" "$GATE_LAST" "T5 no contracts: verdict"
drop_repo

# ==== a control run that is not green ends the gate before any contract run ====

# T6: red on the untouched head
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
gate_run bash -c 'echo broken; exit 7'
assert_eq "3" "$GATE_RC" "T6 control red: exit"
assert_eq "TESTS_RED 7" "$GATE_LAST" "T6 control red: verdict"
assert_eq "1" "$(verdict_lines)" "T6 control red: exactly one verdict line"
assert_eq "### control" "$(grep '^### ' "$OUT/revert-gate.log")" "T6 control red: no contract run follows"
drop_repo

# T7: hangs past the deadline
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
CF_TEST_DEADLINE_S=1 gate_run sleep 30
assert_eq "124" "$GATE_RC" "T7 control stalled: exit"
assert_eq "TESTS_STALLED 1" "$GATE_LAST" "T7 control stalled: verdict"
assert_eq "1" "$(verdict_lines)" "T7 control stalled: exactly one verdict line"
drop_repo

# T8: red-first, without the control run a red suite reads as CLEAN
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
mutant 's/# -- control run --.*?# -- end control run --\n//s'
GATE_REAL="$GATE"; GATE="$MUT"; gate_run bash -c 'exit 7'; GATE="$GATE_REAL"
assert_eq "CLEAN 1" "$GATE_LAST" "T8 no control run passes a red suite"
drop_repo

# T9: red-first, without the contract runs a vacuous contract reads as CLEAN
new_repo; write_runner; base_commit; add_vacuous
write_contracts "[$C2]"
mutant 's/# -- contract runs --.*?# -- end contract runs --\n//s'
GATE_REAL="$GATE"; GATE="$MUT"; gate_run bash run-tests.sh; GATE="$GATE_REAL"
assert_eq "CLEAN 1" "$GATE_LAST" "T9 no contract runs passes a vacuous contract"
drop_repo

# ==== a gate that cannot finish prints one ERROR line and no other verdict ====

# T10: a git failure mid-revert ends the gate before any verdict. The first
# read-tree fails; later git calls, the cleanup's included, work.
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
mkdir -p "$REPO_TOP/gitwrap"
cat >"$REPO_TOP/gitwrap/git" <<WRAP
#!/bin/bash
case " \$* " in
  *" read-tree "*) [ -e "$REPO_TOP/read-tree.failed" ] || { : >"$REPO_TOP/read-tree.failed"; exit 128; } ;;
esac
exec "$(command -v git)" "\$@"
WRAP
chmod +x "$REPO_TOP/gitwrap/git"
before="$(git -C "$REPO" worktree list)"
PATH="$REPO_TOP/gitwrap:$PATH" gate_run bash run-tests.sh
assert_eq "1" "$GATE_RC" "T10 git failure: exit"
assert_eq "1" "$(verdict_lines)" "T10 git failure: exactly one verdict line"
case "$GATE_LAST" in "ERROR "?*) _assert_pass ;; *) _assert_fail "T10 git failure: last line is not an ERROR: [$GATE_LAST]" ;; esac
assert_eq "$before" "$(git -C "$REPO" worktree list)" "T10 git failure: the worktree is gone"
drop_repo

# T11: a runner that is missing is a red control run (127), not an ERROR
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
gate_run ./no-such-runner.sh
assert_eq "TESTS_RED 127" "$GATE_LAST" "T11 missing runner: a red control run"
assert_eq "3" "$GATE_RC" "T11 missing runner: exit"
drop_repo

# ==== the verdict starts its own line, whatever the suite printed last ====

# a_fixture: base is a README; one commit adds src/a.sh and tests/a.sh; C1 touches
# both and names tests/a.sh as its test
a_fixture() {
  new_repo
  echo readme >"$REPO/README"
  commit_all base
  BASE="$(head_sha)"
  mkdir -p "$REPO/src" "$REPO/tests"
  echo 'echo a' >"$REPO/src/a.sh"
  echo '[ "$(bash src/a.sh)" = a ]' >"$REPO/tests/a.sh"
  commit_all c1
  write_contracts '[{"name":"C1","touches_files":["src/a.sh","tests/a.sh"],"test_files":["tests/a.sh"]}]'
}

# B1-1: a green suite whose last output has no newline
a_fixture
gate_run bash -c '[ -f src/a.sh ] || exit 1; printf "3 passed"'
assert_eq "CLEAN 1" "$GATE_LAST" "B1-1 unterminated green output: last line is the verdict"
assert_eq "0" "$GATE_RC" "B1-1 unterminated green output: exit"
drop_repo

# B1-2: a stalled suite that printed a partial line
a_fixture
CF_TEST_DEADLINE_S=1 gate_run bash -c 'printf waiting; sleep 30'
assert_eq "TESTS_STALLED 1" "$GATE_LAST" "B1-2 stalled with a partial line: last line is the verdict"
assert_eq "124" "$GATE_RC" "B1-2 stalled with a partial line: exit"
drop_repo

# B1-3: failure markers cut by the byte cap in mid-line
a_fixture
gate_run perl -e 'print "FAIL" . ("x" x 400) . "\n" for 1 .. 10; exit 1'
assert_eq "TESTS_RED 1" "$GATE_LAST" "B1-3 capped failure markers: last line is the verdict"
assert_eq "3" "$GATE_RC" "B1-3 capped failure markers: exit"
drop_repo

# B1-4: a red suite that printed a partial line
a_fixture
gate_run bash -c 'printf boom; exit 1'
assert_eq "TESTS_RED 1" "$GATE_LAST" "B1-4 unterminated red output: last line is the verdict"
assert_eq "1" "$(printf '%s\n' "$GATE_OUT" | grep -cx -- '--- failure markers ---')" "B1-4 unterminated red output: the header starts its own line"
drop_repo
