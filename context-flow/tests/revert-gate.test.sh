#!/usr/bin/env bash
# Revert gate (cf-pi-revert-gate.sh), driven against real git fixtures.
#
# Fixture F: a base commit with run-tests.sh, src/base.sh and tests/base.test.sh,
# plus the shard commits a case needs. Red-first cases run a copy of the gate
# with one change and assert the case it targets no longer holds.

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
GATE="$REAL_SCRIPTS/cf-pi-revert-gate.sh"

new_flow() {
  FLOW="$(mktemp -d)"
  SHARD="$FLOW/shards/A"
  WORK="$SHARD/work"
  mkdir -p "$WORK/src" "$WORK/tests"
  git -C "$WORK" init -q -b main
  git -C "$WORK" config core.hooksPath /dev/null
  git -C "$WORK" config user.email t@t
  git -C "$WORK" config user.name t
}

# write_runner [GUARD_LINE]
write_runner() {
  {
    [ -z "${1:-}" ] || printf '%s\n' "$1"
    printf '%s\n' 'for f in tests/*.test.sh; do bash "$f" || exit 1; done'
  } >"$WORK/run-tests.sh"
}

commit_all() {
  git -C "$WORK" add -A
  git -C "$WORK" commit -qm "$1"
}

base_commit() {
  printf '%s\n' 'echo base' >"$WORK/src/base.sh"
  printf '%s\n' '[ "$(bash src/base.sh)" = base ]' >"$WORK/tests/base.test.sh"
  commit_all base
  BASE_HEAD="$(git -C "$WORK" rev-parse HEAD)"
}

add_effective() {
  printf '%s\n' 'echo $(($1 + $2))' >"$WORK/src/add.sh"
  printf '%s\n' '[ "$(bash src/add.sh 2 3)" = 5 ]' >"$WORK/tests/add.test.sh"
  commit_all c1
}

# add_vacuous [test-only]
add_vacuous() {
  [ "${1:-}" = test-only ] || printf '%s\n' 'echo $(($1 * $2))' >"$WORK/src/mul.sh"
  printf '%s\n' 'exit 0' >"$WORK/tests/mul.test.sh"
  commit_all c2
}

# set_docs CONTRACTS_JSON_ARRAY SHARD_CONTRACTS_JSON_ARRAY
set_docs() {
  printf '{"schema_version":1,"contracts":%s}\n' "$1" >"$FLOW/contracts.json"
  printf '{"groups":{"A":{"contracts":%s,"files":[]}}}\n' "$2" >"$FLOW/shards.json"
}

# env_sh [REPO_ROOT] [BASE_HEAD]. TEST_RUNNER="false" is a trap: the gate must
# run the command it is given, never this.
env_sh() {
  local root="$WORK" base="${BASE_HEAD:-}"
  [ $# -lt 1 ] || root="$1"
  [ $# -lt 2 ] || base="$2"
  cat >"$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-shard-A"
FLOW_SESSION="$FLOW"
SHARD_ID="A"
REPO_ROOT="$root"
BASE_HEAD="$base"
TEST_RUNNER="false"
EOF
}

# run_gate GATE TEST_CMD [ARGS...] -> GATE_OUT, GATE_RC
run_gate() {
  local g="$1"
  shift
  GATE_OUT="$(bash "$g" "$SHARD" "$@" 2>"$FLOW/gate.err")"
  GATE_RC=$?
}

# mutant PERL_SUBSTITUTION -> MUT, a copy of the gate with that one change.
# It sits next to a link to the real cf-pi-env.sh, which the gate sources.
mutant() {
  mkdir -p "$FLOW/mut"
  ln -s "$REAL_SCRIPTS/cf-pi-env.sh" "$FLOW/mut/cf-pi-env.sh"
  MUT="$FLOW/mut/cf-pi-revert-gate.sh"
  perl -0777 -pe "$1" "$GATE" >"$MUT"
  local applied=yes
  cmp -s "$GATE" "$MUT" && applied=no
  assert_eq "yes" "$applied" "mutation applies: $1"
}

# assert_not_verdict LABEL OUT RC: a mutant must break the case it targets.
assert_not_verdict() {
  local held=no
  [ "$GATE_OUT" = "$2" ] && [ "$GATE_RC" = "$3" ] && held=yes
  assert_eq "no" "$held" "$1 (got [$GATE_OUT] rc=$GATE_RC)"
}

C1='[{"name":"C1","touches_files":["src/add.sh","tests/add.test.sh"]}]'
C2='[{"name":"C2","touches_files":["src/mul.sh","tests/mul.test.sh"]}]'
C1C2='[{"name":"C1","touches_files":["src/add.sh","tests/add.test.sh"]},{"name":"C2","touches_files":["src/mul.sh","tests/mul.test.sh"]}]'

# ==== contracts whose tests stay green on revert are named ====

# T1: an effective contract goes red
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
run_gate "$GATE" bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_OUT" "T1 effective contract: stdout"
assert_eq "0" "$GATE_RC" "T1 effective contract: exit"
rm -rf "$FLOW"

# T2: a vacuous contract stays green
new_flow; write_runner; base_commit; add_vacuous
set_docs "$C2" '["C2"]'; env_sh
run_gate "$GATE" bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_OUT" "T2 vacuous contract: stdout"
assert_eq "2" "$GATE_RC" "T2 vacuous contract: exit"
rm -rf "$FLOW"

# T3: C2's run must not carry C1's test file
new_flow; write_runner; base_commit; add_effective; add_vacuous
set_docs "$C1C2" '["C1","C2"]'; env_sh
run_gate "$GATE" bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_OUT" "T3 isolation: stdout"
assert_eq "2" "$GATE_RC" "T3 isolation: exit"
rm -rf "$FLOW"

# T4: the builder committed the test and skipped the source
new_flow; write_runner; base_commit; add_vacuous test-only
set_docs "$C2" '["C2"]'; env_sh
run_gate "$GATE" bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_OUT" "T4 test-only commit: stdout"
assert_eq "2" "$GATE_RC" "T4 test-only commit: exit"
rm -rf "$FLOW"

# T5: a coverage-only test of a pre-existing program
new_flow; write_runner; base_commit
printf '%s\n' '[ "$(bash src/base.sh)" = base ]' >"$WORK/tests/base_more.test.sh"
commit_all c3
set_docs '[{"name":"C3","touches_files":["tests/base_more.test.sh"]}]' '["C3"]'; env_sh
run_gate "$GATE" bash run-tests.sh
assert_eq "STAYS_GREEN C3" "$GATE_OUT" "T5 coverage-only: stdout"
assert_eq "2" "$GATE_RC" "T5 coverage-only: exit"
rm -rf "$FLOW"

# T6: a fix whose test already existed (red at base) still gets a run
new_flow; write_runner
printf '%s\n' 'echo 1' >"$WORK/src/fix.sh"
printf '%s\n' '[ "$(bash src/fix.sh)" = 2 ]' >"$WORK/tests/fix.test.sh"
base_commit
printf '%s\n' 'echo 2' >"$WORK/src/fix.sh"
commit_all c4
set_docs '[{"name":"C4","touches_files":["src/fix.sh","tests/fix.test.sh"]}]' '["C4"]'; env_sh
run_gate "$GATE" bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_OUT" "T6 fix with pre-existing test: stdout"
assert_eq "0" "$GATE_RC" "T6 fix with pre-existing test: exit"
rm -rf "$FLOW"

# T7: a root package.json is never reverted
pkg_fixture() {
  new_flow; write_runner '[ -f package.json ] || exit 3'; base_commit
  printf '%s\n' '{}' >"$WORK/package.json"
  add_vacuous
  set_docs "$C2" '["C2"]'; env_sh
}
pkg_fixture
run_gate "$GATE" bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_OUT" "T7 package.json kept: stdout"
assert_eq "2" "$GATE_RC" "T7 package.json kept: exit"
rm -rf "$FLOW"

# T8: files merged from a prerequisite checkpoint are not own paths
prereq_fixture() {
  new_flow; write_runner '[ -f src/lib.sh ] || exit 3'; base_commit
  git -C "$WORK" checkout -q -b checkpoint
  printf '%s\n' 'echo lib' >"$WORK/src/lib.sh"
  commit_all lib
  git -C "$WORK" tag cf-checkpoint-X
  git -C "$WORK" checkout -q main
  git -C "$WORK" merge -q --no-ff cf-checkpoint-X -m "merge checkpoint"
  printf '%s\n' 'refs/tags/cf-checkpoint-X' >"$SHARD/prereq-refs"
  add_vacuous
  set_docs "$C2" '["C2"]'; env_sh
}
prereq_fixture
run_gate "$GATE" bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_OUT" "T8 prerequisite files kept: stdout"
assert_eq "2" "$GATE_RC" "T8 prerequisite files kept: exit"
rm -rf "$FLOW"

# T9: env.sh's TEST_RUNNER=false is not what the gate runs
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
assert_contains "$(cat "$SHARD/env.sh")" 'TEST_RUNNER="false"' "T9 fixture sets the trap runner"
run_gate "$GATE" bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_OUT" "T9 given command, not TEST_RUNNER: stdout"
rm -rf "$FLOW"

# T10: a reverted run killed at the deadline counts as red
new_flow; write_runner; base_commit
printf '%s\n' 'echo $(($1 + $2))' >"$WORK/src/add.sh"
printf '%s\n' '[ -f src/add.sh ] || sleep 30' '[ "$(bash src/add.sh 2 3)" = 5 ]' >"$WORK/tests/add.test.sh"
commit_all c1
set_docs "$C1" '["C1"]'; env_sh
start=$(date +%s)
CF_TEST_DEADLINE_S=2 run_gate "$GATE" bash run-tests.sh
elapsed=$(( $(date +%s) - start ))
assert_eq "CLEAN 1" "$GATE_OUT" "T10 deadline kill is red: stdout"
assert_eq "0" "$GATE_RC" "T10 deadline kill is red: exit"
pace=late; [ "$elapsed" -lt 20 ] && pace=prompt
assert_eq "prompt" "$pace" "T10 returned in ${elapsed}s"
rm -rf "$FLOW"

# T11: one control run plus one run per contract
new_flow; write_runner; base_commit; add_effective
printf '%s\n' 'echo $(($1 - $2))' >"$WORK/src/sub.sh"
printf '%s\n' '[ "$(bash src/sub.sh 5 3)" = 2 ]' >"$WORK/tests/sub.test.sh"
commit_all c5
set_docs '[{"name":"C1","touches_files":["src/add.sh","tests/add.test.sh"]},{"name":"C5","touches_files":["src/sub.sh","tests/sub.test.sh"]}]' '["C1","C5"]'
env_sh
printf '%s\n' "printf 'x\\n' >>'$FLOW/counter'" 'bash run-tests.sh' >"$FLOW/count.sh"
run_gate "$GATE" bash "$FLOW/count.sh"
assert_eq "CLEAN 2" "$GATE_OUT" "T11 two effective contracts: stdout"
assert_eq "3" "$(wc -l <"$FLOW/counter" 2>/dev/null | tr -d ' ')" "T11 runs: 1 control + 2 contracts"
rm -rf "$FLOW"

# T12: no own paths, an intent-to-add file present: skip the dirty check, still judge
empty_fixture() {
  new_flow; write_runner; base_commit
  set_docs "$C1" '["C1"]'; env_sh
  printf 'n\n' >"$WORK/notes.txt"
  git -C "$WORK" add -N notes.txt
}
empty_fixture
run_gate "$GATE" bash run-tests.sh
assert_eq "STAYS_GREEN C1" "$GATE_OUT" "T12 empty own paths: stdout"
assert_eq "2" "$GATE_RC" "T12 empty own paths: exit"
rm -rf "$FLOW"

# R1: a renamed file's old path is an own path too, so a run puts it back
new_flow; write_runner; base_commit
git -C "$WORK" mv src/base.sh src/core.sh
printf '%s\n' '[ "$(bash src/core.sh)" = base ]' >"$WORK/tests/base.test.sh"
commit_all c1
add_vacuous
set_docs '[{"name":"C1","touches_files":["src/base.sh","src/core.sh","tests/base.test.sh"]},{"name":"C2","touches_files":["src/mul.sh","tests/mul.test.sh"]}]' '["C1","C2"]'
env_sh
run_gate "$GATE" bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_OUT" "R1 rename reverted: stdout"
assert_eq "2" "$GATE_RC" "R1 rename reverted: exit"
rm -rf "$FLOW"

# T13: red-first, each mutation breaks its case
new_flow; write_runner; base_commit; add_effective; add_vacuous
set_docs "$C1C2" '["C1","C2"]'; env_sh
mutant 's/if is_test_path "\$p" && [^;]*; then continue; fi/if is_test_path "\$p"; then continue; fi/'
run_gate "$MUT" bash run-tests.sh
assert_not_verdict "T13 keeping every own test file breaks T3" "STAYS_GREEN C2" 2
rm -rf "$FLOW"

pkg_fixture
mutant 's/^ *if printf .*BUILD_LOCK_ALLOWLIST.*continue; fi\n//m'
run_gate "$MUT" bash run-tests.sh
assert_not_verdict "T13 reverting package.json breaks T7" "STAYS_GREEN C2" 2
rm -rf "$FLOW"

prereq_fixture
mutant 's/ *--not \$\(cat "\$SHARD_SESSION\/prereq-refs" 2>\/dev\/null\)//'
run_gate "$MUT" bash run-tests.sh
assert_not_verdict "T13 own paths without --not breaks T8" "STAYS_GREEN C2" 2
rm -rf "$FLOW"

empty_fixture
mutant 's/\[ \$\{#own\[@\]\} -eq 0 \] \|\| (dirty=\$\(own_status\)\n\[ -z "\$dirty" \] \|\| verdict "ERROR dirty-own-paths)/$1/'
run_gate "$MUT" bash run-tests.sh
assert_not_verdict "T13 dirty check on an empty path list breaks T12" "STAYS_GREEN C1" 2
rm -rf "$FLOW"

# ==== a red or hanging control run is an error, not a verdict ====

# T1: already red on the untouched tree
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
run_gate "$GATE" false
assert_eq "ERROR control-red" "$GATE_OUT" "control T1 red: stdout"
assert_eq "1" "$GATE_RC" "control T1 red: exit"
c1_run=absent; grep -qx '### C1' "$SHARD/revert-gate.log" 2>/dev/null && c1_run=present
assert_eq "absent" "$c1_run" "control T1 red: no contract run follows"
rm -rf "$FLOW"

# T2: hangs past the deadline
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
start=$(date +%s)
CF_TEST_DEADLINE_S=1 run_gate "$GATE" sleep 30
elapsed=$(( $(date +%s) - start ))
assert_eq "ERROR control-stalled 1s" "$GATE_OUT" "control T2 stalled: stdout"
assert_eq "1" "$GATE_RC" "control T2 stalled: exit"
pace=late; [ "$elapsed" -lt 15 ] && pace=prompt
assert_eq "prompt" "$pace" "control T2 returned in ${elapsed}s"
rm -rf "$FLOW"

# T3: red-first, without the control run a red suite reads as CLEAN
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
mutant 's/^run_suite control\n(\[.*ERROR control-.*\n)*//m'
run_gate "$MUT" false
assert_eq "CLEAN 1" "$GATE_OUT" "control T3 no control run passes a red suite"
rm -rf "$FLOW"

# ==== the shard is left as the gate found it ====

# assert_restored LABEL HEAD_BEFORE
assert_restored() {
  assert_eq "" "$(git -C "$WORK" status --porcelain -- src tests)" "$1: own-path status"
  assert_eq "" "$(git -C "$WORK" diff HEAD --stat)" "$1: diff against HEAD"
  assert_eq "$2" "$(git -C "$WORK" rev-parse HEAD)" "$1: HEAD"
}

# T1: after CLEAN
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
head=$(git -C "$WORK" rev-parse HEAD)
run_gate "$GATE" bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_OUT" "restore T1: stdout"
assert_restored "restore T1 after CLEAN" "$head"
rm -rf "$FLOW"

# T2: after STAYS_GREEN
new_flow; write_runner; base_commit; add_effective; add_vacuous
set_docs "$C1C2" '["C1","C2"]'; env_sh
head=$(git -C "$WORK" rev-parse HEAD)
run_gate "$GATE" bash run-tests.sh
assert_eq "STAYS_GREEN C2" "$GATE_OUT" "restore T2: stdout"
assert_restored "restore T2 after STAYS_GREEN" "$head"
rm -rf "$FLOW"

# T3: after ERROR control-red
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
head=$(git -C "$WORK" rev-parse HEAD)
run_gate "$GATE" false
assert_eq "ERROR control-red" "$GATE_OUT" "restore T3: stdout"
assert_restored "restore T3 after ERROR" "$head"
rm -rf "$FLOW"

# T4: untracked and intent-to-add files outside the own paths are not its business
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
mkdir -p "$WORK/node_modules"
printf 'x\n' >"$WORK/node_modules/x"
printf 'n\n' >"$WORK/notes.txt"
git -C "$WORK" add -N notes.txt
before=$(git -C "$WORK" status --porcelain -- node_modules notes.txt)
run_gate "$GATE" bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_OUT" "restore T4: stdout"
assert_eq "$before" "$(git -C "$WORK" status --porcelain -- node_modules notes.txt)" "restore T4: status of foreign files"
assert_eq "x" "$(cat "$WORK/node_modules/x")" "restore T4: untracked file content"
assert_eq "n" "$(cat "$WORK/notes.txt")" "restore T4: intent-to-add file content"
rm -rf "$FLOW"

# T5: an uncommitted edit to an own path is refused, untouched
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
printf '%s\n' 'echo 99' >"$WORK/src/add.sh"
run_gate "$GATE" bash run-tests.sh
assert_eq "ERROR dirty-own-paths src/add.sh" "$GATE_OUT" "restore T5: stdout"
assert_eq "1" "$GATE_RC" "restore T5: exit"
assert_eq "echo 99" "$(cat "$WORK/src/add.sh")" "restore T5: the edit survives"
rm -rf "$FLOW"

# T6: gate 3's log is never written
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
printf 'GATE3-EVIDENCE\n' >"$SHARD/test-output.log"
cp "$SHARD/test-output.log" "$FLOW/evidence"
run_gate "$GATE" bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_OUT" "restore T6: stdout"
same=no; cmp -s "$FLOW/evidence" "$SHARD/test-output.log" && same=yes
assert_eq "yes" "$same" "restore T6: test-output.log byte-identical"
rm -rf "$FLOW"

# T7: TERM mid-run restores, then says so
new_flow; write_runner; base_commit
printf '%s\n' 'echo $(($1 + $2))' >"$WORK/src/add.sh"
printf '%s\n' 'sleep 3' '[ "$(bash src/add.sh 2 3)" = 5 ]' >"$WORK/tests/add.test.sh"
commit_all c1
set_docs "$C1" '["C1"]'; env_sh
bash "$GATE" "$SHARD" bash run-tests.sh >"$FLOW/gate.out" 2>"$FLOW/gate.err" &
pid=$!
n=0
while [ -f "$WORK/src/add.sh" ] && [ "$n" -lt 300 ]; do sleep 0.1; n=$((n + 1)); done
saw=reverted; [ -f "$WORK/src/add.sh" ] && saw=never-reverted
assert_eq "reverted" "$saw" "restore T7: the gate reverted src/add.sh"
kill -TERM "$pid"
wait "$pid"
rc=$?
assert_eq "1" "$rc" "restore T7: exit"
assert_eq "ERROR interrupted" "$(tail -1 "$FLOW/gate.out")" "restore T7: last stdout line"
assert_eq "echo \$((\$1 + \$2))" "$(cat "$WORK/src/add.sh" 2>/dev/null)" "restore T7: src/add.sh restored"
assert_eq "" "$(git -C "$WORK" status --porcelain -- src tests)" "restore T7: own-path status"
rm -rf "$FLOW"

# T8: no git hook fires
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
mkdir -p "$FLOW/hooks"
printf '#!/bin/sh\necho fired >>"%s/hook.log"\n' "$FLOW" >"$FLOW/hooks/post-checkout"
chmod +x "$FLOW/hooks/post-checkout"
git -C "$WORK" config core.hooksPath "$FLOW/hooks"
run_gate "$GATE" bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_OUT" "restore T8: stdout"
hook=absent; [ -e "$FLOW/hook.log" ] && hook=present
assert_eq "absent" "$hook" "restore T8: post-checkout never ran"
rm -rf "$FLOW"

# T9: red-first, without the restore src/add.sh stays reverted
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
mutant 's/^restore\(\) \{.*\}$/restore() { :; }/m'
run_gate "$MUT" bash run-tests.sh
gone=present; [ -f "$WORK/src/add.sh" ] || gone=missing
assert_eq "missing" "$gone" "restore T9 no restore leaves src/add.sh missing"
held=yes; [ -z "$(git -C "$WORK" status --porcelain -- src tests)" ] || held=no
assert_eq "no" "$held" "restore T9 no restore breaks T1's status check"
rm -rf "$FLOW"

# ==== only non-git scratch mode passes unjudged ====

# T1: REPO_ROOT empty skips without running anything
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh ""
printf ': >"%s/ran"\n' "$FLOW" >"$FLOW/mark.sh"
run_gate "$GATE" bash "$FLOW/mark.sh"
assert_eq "SKIPPED no-git" "$GATE_OUT" "scratch T1: stdout"
assert_eq "0" "$GATE_RC" "scratch T1: exit"
ran=absent; [ -e "$FLOW/ran" ] && ran=present
assert_eq "absent" "$ran" "scratch T1: TEST_CMD never ran"
rm -rf "$FLOW"

# T2: an unresolvable BASE_HEAD
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh "$WORK" deadbeef
run_gate "$GATE" bash run-tests.sh
assert_eq "ERROR base-head-unresolvable" "$GATE_OUT" "scratch T2: stdout"
assert_eq "1" "$GATE_RC" "scratch T2: exit"
rm -rf "$FLOW"

# T3: no work tree
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh
rm -rf "$WORK"
run_gate "$GATE" bash run-tests.sh
assert_eq "ERROR work-tree-missing" "$GATE_OUT" "scratch T3: stdout"
assert_eq "1" "$GATE_RC" "scratch T3: exit"
rm -rf "$FLOW"

# T4: a git that exits 0 and prints nothing is a clean repository
FLOW="$(mktemp -d)"; SHARD="$FLOW/shards/A"; WORK="$SHARD/work"
mkdir -p "$WORK" "$FLOW/bin"
printf '#!/bin/sh\nexit 0\n' >"$FLOW/bin/git"
chmod +x "$FLOW/bin/git"
set_docs "$C1" '["C1"]'; env_sh "$WORK" abc123
printf '[ -e "%s/flipped" ] && exit 1\n: >"%s/flipped"\n' "$FLOW" "$FLOW" >"$FLOW/flip.sh"
PATH="$FLOW/bin:$PATH" run_gate "$GATE" bash "$FLOW/flip.sh"
assert_eq "CLEAN 1" "$GATE_OUT" "scratch T4 stub git: stdout"
assert_eq "0" "$GATE_RC" "scratch T4 stub git: exit"
rm -rf "$FLOW"

# T5: red-first, skipping whenever git fails turns T2 into a pass
new_flow; write_runner; base_commit; add_effective
set_docs "$C1" '["C1"]'; env_sh "$WORK" deadbeef
mutant 's/^set -euo pipefail\n/set -euo pipefail\nexec 3>&1\ngit() { command git "\$@" || { echo "SKIPPED no-git" >&3; exit 0; }; }\n/m'
run_gate "$MUT" bash run-tests.sh
assert_eq "SKIPPED no-git" "$GATE_OUT" "scratch T5 skip-on-git-failure passes T2's case"
rm -rf "$FLOW"
