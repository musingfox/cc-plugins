#!/usr/bin/env bash
# Revert gate (cf-revert-gate.sh), driven against real git fixtures.
#
# Fixture: a base commit with run-tests.sh, src/base.sh and tests/base.test.sh,
# plus the commits a case needs. Red-first cases run a copy of the gate with one
# change and assert the case it targets no longer holds.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/repo.sh"

GATE="$(cd "$CF_TESTS_DIR/../scripts" && pwd)/cf-revert-gate.sh"

# mutant PERL_SUBSTITUTION -> MUT, a copy of the gate with that one change.
mutant() {
  mkdir -p "$REPO_TOP/mut"
  MUT="$REPO_TOP/mut/cf-revert-gate.sh"
  perl -0777 -pe "$1" "$GATE" >"$MUT"
  local applied=yes
  cmp -s "$GATE" "$MUT" && applied=no
  assert_eq "yes" "$applied" "mutation applies: $1"
}

# mutant_gate_run CMD...: gate_run with the mutant
mutant_gate_run() { local real="$GATE"; GATE="$MUT"; gate_run "$@"; GATE="$real"; }

# assert_not_verdict LABEL OUT RC: a mutant must break the case it targets.
assert_not_verdict() {
  local held=no
  [ "$GATE_LAST" = "$2" ] && [ "$GATE_RC" = "$3" ] && held=yes
  assert_eq "no" "$held" "$1 (got [$GATE_LAST] rc=$GATE_RC)"
}

# ==== contracts whose tests stay green on revert are named ====

# T1: an effective contract goes red
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
gate_run bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_LAST" "T1 effective contract: verdict"
assert_eq "0" "$GATE_RC" "T1 effective contract: exit"
drop_repo

# T2: a vacuous contract stays green
new_repo; write_runner; base_commit; add_vacuous
write_contracts "[$C2]"
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T2 vacuous contract: verdict"
assert_eq "2" "$GATE_RC" "T2 vacuous contract: exit"
drop_repo

# T3: C2's run must not carry C1's test file
new_repo; write_runner; base_commit; add_effective; add_vacuous
write_contracts "[$C1,$C2]"
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T3 isolation: verdict"
assert_eq "2" "$GATE_RC" "T3 isolation: exit"
drop_repo

# T4: the builder committed the test and skipped the source
new_repo; write_runner; base_commit; add_vacuous test-only
write_contracts "[$C2]"
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T4 test-only commit: verdict"
assert_eq "2" "$GATE_RC" "T4 test-only commit: exit"
drop_repo

# T5: a coverage-only test of a pre-existing program
new_repo; write_runner; base_commit
printf '%s\n' '[ "$(bash src/base.sh)" = base ]' >"$REPO/tests/base_more.test.sh"
commit_all c3
write_contracts '[{"name":"C3","touches_files":["tests/base_more.test.sh"]}]'
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C3" "$GATE_LAST" "T5 coverage-only: verdict"
assert_eq "2" "$GATE_RC" "T5 coverage-only: exit"
drop_repo

# T6: a fix whose test already existed (red at base) still gets a run
new_repo; write_runner
printf '%s\n' 'echo 1' >"$REPO/src/fix.sh"
mkdir -p "$REPO/tests"
printf '%s\n' '[ "$(bash src/fix.sh)" = 2 ]' >"$REPO/tests/fix.test.sh"
base_commit
printf '%s\n' 'echo 2' >"$REPO/src/fix.sh"
commit_all c4
write_contracts '[{"name":"C4","touches_files":["src/fix.sh","tests/fix.test.sh"]}]'
gate_run bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_LAST" "T6 fix with pre-existing test: verdict"
assert_eq "0" "$GATE_RC" "T6 fix with pre-existing test: exit"
drop_repo

# T7: a root package.json is never reverted
pkg_fixture() {
  new_repo; write_runner '[ -f package.json ] || exit 3'; base_commit
  printf '%s\n' '{}' >"$REPO/package.json"
  add_vacuous
  write_contracts "[$C2]"
}
pkg_fixture
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T7 package.json kept: verdict"
assert_eq "2" "$GATE_RC" "T7 package.json kept: exit"
drop_repo

# T8: files merged in from a prerequisite are not own paths once --base is the merge
prereq_fixture() {
  new_repo; write_runner '[ -f src/lib.sh ] || exit 3'; base_commit
  git -C "$REPO" checkout -q -b checkpoint
  printf '%s\n' 'echo lib' >"$REPO/src/lib.sh"
  commit_all lib
  git -C "$REPO" checkout -q main
  git -C "$REPO" merge -q --no-ff checkpoint -m "merge checkpoint"
  BASE="$(head_sha)"
  add_vacuous
  write_contracts "[$C2]"
}
prereq_fixture
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T8 prerequisite files kept: verdict"
assert_eq "2" "$GATE_RC" "T8 prerequisite files kept: exit"
drop_repo

# T9: the gate runs the command it is given, in a tree at head, and the contracts
# file is read from where it lies (outside the repo)
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
gate_run bash -c 'pwd -P > "$0"; bash run-tests.sh' "$REPO_TOP/cwd"
assert_eq "CLEAN 1" "$GATE_LAST" "T9 given command: verdict"
cwd="$(cat "$REPO_TOP/cwd")"
case "$cwd" in "$(cd "$REPO" && pwd -P)") cwd_is=the-repo ;; *) cwd_is=a-worktree ;; esac
assert_eq "a-worktree" "$cwd_is" "T9 the command runs in the gate's own worktree, not in DIR"
drop_repo

# T10: a reverted run killed at the deadline counts as red
new_repo; write_runner; base_commit
printf '%s\n' 'echo $(($1 + $2))' >"$REPO/src/add.sh"
printf '%s\n' '[ -f src/add.sh ] || sleep 30' '[ "$(bash src/add.sh 2 3)" = 5 ]' >"$REPO/tests/add.test.sh"
commit_all c1
write_contracts "[$C1]"
start=$(date +%s)
CF_TEST_DEADLINE_S=2 gate_run bash run-tests.sh
elapsed=$(( $(date +%s) - start ))
assert_eq "CLEAN 1" "$GATE_LAST" "T10 deadline kill is red: verdict"
assert_eq "0" "$GATE_RC" "T10 deadline kill is red: exit"
pace=late; [ "$elapsed" -lt 20 ] && pace=prompt
assert_eq "prompt" "$pace" "T10 returned in ${elapsed}s"
drop_repo

# T11: one control run plus one run per contract, in .contracts[] order
new_repo; write_runner; base_commit; add_effective
printf '%s\n' 'echo $(($1 - $2))' >"$REPO/src/sub.sh"
printf '%s\n' '[ "$(bash src/sub.sh 5 3)" = 2 ]' >"$REPO/tests/sub.test.sh"
commit_all c5
write_contracts '[{"name":"C1","touches_files":["src/add.sh","tests/add.test.sh"]},{"name":"C5","touches_files":["src/sub.sh","tests/sub.test.sh"]}]'
printf '%s\n' "printf 'x\\n' >>'$REPO_TOP/counter'" 'bash run-tests.sh' >"$REPO_TOP/count.sh"
gate_run bash "$REPO_TOP/count.sh"
assert_eq "CLEAN 2" "$GATE_LAST" "T11 two effective contracts: verdict"
assert_eq "3" "$(wc -l <"$REPO_TOP/counter" 2>/dev/null | tr -d ' ')" "T11 runs: 1 control + 2 contracts"
assert_eq "### control,### C1,### C5" "$(grep '^### ' "$OUT/revert-gate.log" | paste -sd, -)" "T11 log: one section per run, in order"
# no red-run cache: a second gate on the same commits runs everything again
: >"$REPO_TOP/counter"
gate_run bash "$REPO_TOP/count.sh"
assert_eq "3" "$(wc -l <"$REPO_TOP/counter" | tr -d ' ')" "T11 no cache: a second gate reruns all 3"
drop_repo

# T12: no own paths: nothing to revert, every contract's run is green. The range
# holds a commit (an empty range is `ERROR empty-range`, see empty-range.test.sh).
new_repo; write_runner; base_commit
git -C "$REPO" commit -q --allow-empty -m "no files"
write_contracts "[$C1]"
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C1" "$GATE_LAST" "T12 empty own paths: verdict"
assert_eq "2" "$GATE_RC" "T12 empty own paths: exit"
drop_repo

# T13: STAYS_GREEN names every green contract, in contracts-file order
new_repo; write_runner; base_commit; add_vacuous
printf '%s\n' '[ "$(bash src/base.sh)" = base ]' >"$REPO/tests/base_more.test.sh"
commit_all c3
write_contracts '[{"name":"C3","touches_files":["tests/base_more.test.sh"]},'"$C2"']'
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C3,C2" "$GATE_LAST" "T13 several green: verdict, in order"
assert_eq "2" "$GATE_RC" "T13 several green: exit"
drop_repo

# T14: each run starts from head: a vacuous contract first must not leave the
# next contract's tests reverted
new_repo; write_runner; base_commit; add_effective; add_vacuous
write_contracts "[$C2,$C1]"
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T14 order C2,C1: only C2 stays green"
drop_repo

# T15: a renamed file's old path is an own path too, so a run puts it back
new_repo; write_runner; base_commit
git -C "$REPO" mv src/base.sh src/core.sh
printf '%s\n' '[ "$(bash src/core.sh)" = base ]' >"$REPO/tests/base.test.sh"
commit_all c1
add_vacuous
write_contracts '[{"name":"C1","touches_files":["src/base.sh","src/core.sh","tests/base.test.sh"]},'"$C2"']'
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T15 rename reverted: verdict"
assert_eq "2" "$GATE_RC" "T15 rename reverted: exit"
drop_repo

# T16: a name git C-quotes (a double quote) is still an own path, so C2's run drops it
new_repo; write_runner; base_commit
printf '%s\n' 'echo $(($1 + $2))' >"$REPO/src/add.sh"
printf '%s\n' '[ "$(bash src/add.sh 2 3)" = 5 ]' >"$REPO/tests/add\"q.test.sh"
commit_all c1
add_vacuous
write_contracts '[{"name":"C1","touches_files":["src/add.sh","tests/add\"q.test.sh"]},'"$C2"']'
gate_run bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_LAST" "T16 quoted name reverted: verdict"
assert_eq "2" "$GATE_RC" "T16 quoted name reverted: exit"
drop_repo

# T17: a contract's test_files, not the path rule, say which files are its tests.
# spec/scripts/x.sh is implementation (the spec plugin's own layout); a path
# rule reading */spec/* as a test would never revert it and call C1 vacuous.
new_repo; write_runner; base_commit
mkdir -p "$REPO/spec/scripts"
echo 'echo x' >"$REPO/spec/scripts/x.sh"
echo '[ "$(bash spec/scripts/x.sh)" = x ]' >"$REPO/tests/x.test.sh"
commit_all spec-impl
write_contracts '[{"name":"C1","touches_files":["spec/scripts/x.sh","tests/x.test.sh"],"test_files":["tests/x.test.sh"]}]'
gate_run bash tests/x.test.sh
assert_eq "CLEAN 1" "$GATE_LAST" "T17 a declared test_files list overrides the path rule"
# ... and without the field, the path rule reads spec/ as a test directory
write_contracts '[{"name":"C1","touches_files":["spec/scripts/x.sh","tests/x.test.sh"]}]'
gate_run bash tests/x.test.sh
assert_eq "STAYS_GREEN C1" "$GATE_LAST" "T17 without test_files the path rule keeps spec/scripts/x.sh"
drop_repo

# T18: a test_files entry no commit touched is harmless
new_repo; write_runner; base_commit; add_effective
write_contracts '[{"name":"C1","touches_files":["src/add.sh","tests/add.test.sh"],"test_files":["tests/add.test.sh","tests/never.test.sh"]}]'
gate_run bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_LAST" "T18 stray test_files entry: verdict"
drop_repo

# T19: the stdin of every run is /dev/null, not the caller's
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
printf '%s\n' 'read -r line; echo "stdin-read-rc=$?"' 'bash run-tests.sh' >"$REPO_TOP/stdin.sh"
BASE_SAVE="$BASE"
GATE_OUT="$(CF_TEST_DEADLINE_S=20 bash "$GATE" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" -- bash "$REPO_TOP/stdin.sh" 2>/dev/null < <(sleep 12))"
GATE_RC=$?
assert_eq "CLEAN 1" "$(printf '%s\n' "$GATE_OUT" | tail -1)" "T19 a suite that reads stdin gets EOF, not the caller's pipe"
assert_contains "$(cat "$OUT/revert-gate.log")" "stdin-read-rc=1" "T19 the read saw end of file"
drop_repo

# ==== red-first: each mutation breaks the case it targets ====

new_repo; write_runner; base_commit; add_effective; add_vacuous
write_contracts "[$C1,$C2]"
mutant 's/elif is_test_path "\$p" && [^;]*; then continue; fi/elif is_test_path "\$p"; then continue; fi/'
mutant_gate_run bash run-tests.sh
assert_not_verdict "M1 keeping every own test file breaks T3" "STAYS_GREEN C2" 2
drop_repo

pkg_fixture
mutant 's/^ *if printf .*CF_BUILD_LOCK_ALLOWLIST.*continue; fi\n//m'
mutant_gate_run bash run-tests.sh
assert_not_verdict "M2 reverting package.json breaks T7" "STAYS_GREEN C2" 2
drop_repo

new_repo; write_runner; base_commit
git -C "$REPO" mv src/base.sh src/core.sh
printf '%s\n' '[ "$(bash src/core.sh)" = base ]' >"$REPO/tests/base.test.sh"
commit_all c1
add_vacuous
write_contracts '[{"name":"C1","touches_files":["src/base.sh","src/core.sh","tests/base.test.sh"]},'"$C2"']'
mutant 's/(log -z )--no-renames /$1/'
mutant_gate_run bash run-tests.sh
assert_not_verdict "M3 rename detection breaks T15" "STAYS_GREEN C2" 2
drop_repo

new_repo; write_runner; base_commit; add_effective; add_vacuous
write_contracts "[$C2,$C1]"
mutant 's/^restore\(\) \{.*\}$/restore() { :; }/m'
mutant_gate_run bash run-tests.sh
assert_not_verdict "M4 no restore between runs breaks T14" "STAYS_GREEN C2" 2
drop_repo
