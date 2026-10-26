#!/usr/bin/env bash
# What the revert gate does around its runs: input errors, jq-missing, and the
# no-side-effect rule. DIR's checkout, index, branches, tags and stash never
# change; the gate's own detached worktree lives in a fresh temporary directory
# and is gone on every exit path, signals included, so `git worktree list` is
# the same before and after.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"
. "$METHOD_TESTS_DIR/lib/repo.sh"

GATE="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)/revert-gate.sh"

# ==== ERROR: one line on stdout, exit 1, and the suite never ran ====

new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
printf ': >"%s/ran"\n' "$REPO_TOP" >"$REPO_TOP/mark.sh"

# err_case LABEL ARGS... : stdout is exactly one ERROR line, exit 1, TEST_CMD never ran
err_case() {
  local label="$1"; shift
  rm -f "$REPO_TOP/ran"
  OUT_TXT="$(bash "$GATE" "$@" 2>/dev/null)"
  RC=$?
  assert_eq "1" "$RC" "$label: exit"
  assert_eq "1" "$(printf '%s\n' "$OUT_TXT" | grep -c '')" "$label: one stdout line"
  case "$OUT_TXT" in "ERROR "?*) _assert_pass ;; *) _assert_fail "$label: not an ERROR line: [$OUT_TXT]" ;; esac
  assert_eq "absent" "$([ -e "$REPO_TOP/ran" ] && echo present || echo absent)" "$label: the suite never ran"
}
cmd=(-- bash "$REPO_TOP/mark.sh")
good=(--repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT")

err_case "E1 no arguments"
err_case "E2 no --repo" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" "${cmd[@]}"
err_case "E3 no --base" --repo "$REPO" --head HEAD --contracts "$CONTRACTS" --out "$OUT" "${cmd[@]}"
err_case "E4 no --head" --repo "$REPO" --base "$BASE" --contracts "$CONTRACTS" --out "$OUT" "${cmd[@]}"
err_case "E5 no --contracts" --repo "$REPO" --base "$BASE" --head HEAD --out "$OUT" "${cmd[@]}"
err_case "E6 no --out" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" "${cmd[@]}"
err_case "E7 no -- TEST_CMD" "${good[@]}"
err_case "E8 -- with no command" "${good[@]}" --
err_case "E9 unknown flag" "${good[@]}" --bogus "${cmd[@]}"
err_case "E10 flag without a value" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out
err_case "E11 repo is not a directory" --repo "$REPO_TOP/nope" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" "${cmd[@]}"
err_case "E12 repo is not a git repo" --repo "$REPO_TOP" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" "${cmd[@]}"
err_case "E13 unresolvable base" --repo "$REPO" --base deadbeefdeadbeef --head HEAD --contracts "$CONTRACTS" --out "$OUT" "${cmd[@]}"
err_case "E14 unresolvable head" --repo "$REPO" --base "$BASE" --head no-such-branch --contracts "$CONTRACTS" --out "$OUT" "${cmd[@]}"
err_case "E15 head resolves to a tree" --repo "$REPO" --base "$BASE" --head "HEAD^{tree}" --contracts "$CONTRACTS" --out "$OUT" "${cmd[@]}"
err_case "E16 contracts file missing" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/none.json" --out "$OUT" "${cmd[@]}"
printf 'not json' >"$REPO_TOP/bad.json"
err_case "E17 contracts not JSON" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/bad.json" --out "$OUT" "${cmd[@]}"
echo '{"schema_version":2,"contracts":[]}' >"$REPO_TOP/v2.json"
err_case "E18 schema_version 2" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/v2.json" --out "$OUT" "${cmd[@]}"
echo '{"schema_version":1,"contracts":[{"name":"C1"}]}' >"$REPO_TOP/notouch.json"
err_case "E19 a contract without touches_files" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/notouch.json" --out "$OUT" "${cmd[@]}"
echo '{"schema_version":1,"contracts":[{"name":"C1","touches_files":[],"test_files":"t"}]}' >"$REPO_TOP/strtest.json"
err_case "E20 test_files is a string" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$REPO_TOP/strtest.json" --out "$OUT" "${cmd[@]}"
: >"$REPO_TOP/afile"
err_case "E21 --out cannot be created" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$REPO_TOP/afile/sub" "${cmd[@]}"
METHOD_TEST_DEADLINE_S=-5 err_case "E22 negative deadline" "${good[@]}" "${cmd[@]}"

# E23: jq absent -> ERROR jq-missing and nothing else, suite never run
rm -f "$REPO_TOP/ran"
OUT_TXT="$(PATH="$(without_jq)" bash "$GATE" "${good[@]}" "${cmd[@]}" 2>/dev/null)"
RC=$?
assert_eq "ERROR jq-missing" "$OUT_TXT" "E23 jq missing: stdout"
assert_eq "1" "$RC" "E23 jq missing: exit"
assert_eq "absent" "$([ -e "$REPO_TOP/ran" ] && echo present || echo absent)" "E23 jq missing: the suite never ran"
OUT_TXT="$(PATH="$REPO_TOP/empty" "$(command -v bash)" "$GATE" 2>/dev/null)"
assert_eq "ERROR jq-missing" "$OUT_TXT" "E23 jq missing, bare PATH, no arguments: stdout"
drop_repo

# ==== the input forms ====

# I1: relative --repo, --contracts and --out resolve against the caller's cwd,
# and --base/--head take any rev
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
git -C "$REPO" tag base-tag "$BASE"
GATE_OUT="$(cd "$REPO_TOP" && bash "$GATE" --repo repo --base base-tag --head main --contracts contracts.json --out rel-out -- bash run-tests.sh 2>/dev/null)"
assert_eq "CLEAN 1" "$(printf '%s\n' "$GATE_OUT" | tail -1)" "I1 relative paths, tag..branch: verdict"
assert_eq "yes" "$([ -f "$REPO_TOP/rel-out/revert-gate.log" ] && echo yes || echo no)" "I1 the log lands in the relative --out"
drop_repo

# I2: --out is created when missing, and a second gate truncates the log
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
gate_run bash run-tests.sh
first="$(grep -c '^### ' "$OUT/revert-gate.log")"
gate_run bash run-tests.sh
assert_eq "$first" "$(grep -c '^### ' "$OUT/revert-gate.log")" "I2 the log is rewritten, not appended"
assert_eq "2" "$first" "I2 control and C1 sections"
drop_repo

# I3: arguments after -- are the command's, flags included
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
printf '%s\n' 'echo "args:$*" >>"$0.args"' 'bash run-tests.sh' >"$REPO_TOP/args.sh"
gate_run bash "$REPO_TOP/args.sh" --repo --base -- x
assert_eq "CLEAN 1" "$GATE_LAST" "I3 flag-shaped command arguments: verdict"
assert_eq "args:--repo --base -- x" "$(head -1 "$REPO_TOP/args.sh.args")" "I3 the command got its arguments verbatim"
drop_repo

# ==== no side effects ====

# S1: checkout, index, refs, stash and worktrees are as the gate found them
# under every verdict -- and the temporary directory is empty again
for verdict in clean stays_green tests_red stalled error; do
  new_repo; write_runner; base_commit; add_effective
  case "$verdict" in
    stays_green) add_vacuous; write_contracts "[$C1,$C2]" ;;
    *)           write_contracts "[$C1]" ;;
  esac
  dirty_repo
  mkdir -p "$REPO_TOP/tmp"
  snapshot >/dev/null    # git status may refresh the index once; settle it
  before="$(snapshot)"
  deadline=60
  case "$verdict" in
    tests_red) cmd_args=(bash -c 'exit 4') ;;
    stalled)   cmd_args=(sleep 30); deadline=1 ;;
    error)     cmd_args=(bash run-tests.sh); printf 'nope' >"$CONTRACTS" ;;
    *)         cmd_args=(bash run-tests.sh) ;;
  esac
  TMPDIR="$REPO_TOP/tmp" METHOD_TEST_DEADLINE_S=$deadline gate_run "${cmd_args[@]}"
  after="$(snapshot)"
  assert_eq "$before" "$after" "S1 $verdict: checkout, index, refs, stash and worktrees unchanged (last: $GATE_LAST)"
  assert_eq "" "$(ls -A "$REPO_TOP/tmp")" "S1 $verdict: the temporary directory is removed"
  drop_repo
done

# S2: the gate judges commits: an uncommitted edit to an own path is neither
# read nor touched
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
printf '%s\n' 'echo 99' >"$REPO/src/add.sh"
gate_run bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_LAST" "S2 uncommitted edit: verdict from the commits"
assert_eq "echo 99" "$(cat "$REPO/src/add.sh")" "S2 uncommitted edit: survives"
drop_repo

# S3: untracked and intent-to-add files in DIR are not its business
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
mkdir -p "$REPO/node_modules"; printf 'x\n' >"$REPO/node_modules/x"
printf 'n\n' >"$REPO/notes.txt"; git -C "$REPO" add -N notes.txt
snapshot >/dev/null; before="$(snapshot)"
gate_run bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_LAST" "S3 foreign files: verdict"
assert_eq "$before" "$(snapshot)" "S3 foreign files: untouched"
drop_repo

# S4: the gate's worktree exists while a run is going, is a second entry in
# `git worktree list`, is detached at --head, and is not DIR
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
HEADSHA="$(head_sha)"
printf '%s\n' "git -C '$REPO' worktree list >'$REPO_TOP/during'" 'git rev-parse HEAD >"'"$REPO_TOP"'/wt-head"' 'git symbolic-ref -q HEAD >"'"$REPO_TOP"'/wt-ref" || echo detached >"'"$REPO_TOP"'/wt-ref"' 'bash run-tests.sh' >"$REPO_TOP/during.sh"
gate_run bash "$REPO_TOP/during.sh"
assert_eq "CLEAN 1" "$GATE_LAST" "S4 verdict"
assert_eq "2" "$(wc -l <"$REPO_TOP/during" | tr -d ' ')" "S4 during the run: DIR plus the gate's worktree"
assert_eq "$HEADSHA" "$(cat "$REPO_TOP/wt-head")" "S4 the worktree is at --head"
assert_eq "detached" "$(cat "$REPO_TOP/wt-ref")" "S4 the worktree is detached"
assert_eq "1" "$(git -C "$REPO" worktree list | wc -l | tr -d ' ')" "S4 after the run: DIR alone"
drop_repo

# S5: --head need not be what DIR has checked out
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
git -C "$REPO" branch topic
git -C "$REPO" checkout -q --detach "$BASE"
gate_run_head() { GATE_OUT="$(bash "$GATE" --repo "$REPO" --base "$BASE" --head topic --contracts "$CONTRACTS" --out "$OUT" -- bash run-tests.sh 2>/dev/null)"; GATE_RC=$?; GATE_LAST="$(printf '%s\n' "$GATE_OUT" | tail -1)"; }
gate_run_head
assert_eq "CLEAN 1" "$GATE_LAST" "S5 --head topic while DIR sits at base: verdict"
assert_eq "$BASE" "$(head_sha)" "S5 DIR still at base"
drop_repo

# S6: a repo hook never fires (post-checkout runs on worktree add)
new_repo; write_runner; base_commit; add_effective
write_contracts "[$C1]"
mkdir -p "$REPO_TOP/hooks"
for h in post-checkout post-commit reference-transaction; do
  printf '#!/bin/sh\necho fired >>"%s/hook.log"\n' "$REPO_TOP" >"$REPO_TOP/hooks/$h"
  chmod +x "$REPO_TOP/hooks/$h"
done
git -C "$REPO" config core.hooksPath "$REPO_TOP/hooks"
gate_run bash run-tests.sh
assert_eq "CLEAN 1" "$GATE_LAST" "S6 verdict"
assert_eq "absent" "$([ -e "$REPO_TOP/hook.log" ] && echo present || echo absent)" "S6 no git hook fired"
drop_repo

# ==== signals: the worktree and the suite's tree go with the gate ====

# sig_case LABEL SIGNAL WAIT_FOR_PATTERN_FILE_PHASE
# The suite announces each run into $REPO_TOP/phase; the test signals the gate
# once $2-th run has started and checks what is left.
sig_case() {
  local label="$1" sig="$2" nth="$3" n
  new_repo; write_runner; base_commit; add_effective
  write_contracts "[$C1]"
  mkdir -p "$REPO_TOP/tmp"
  printf '%s\n' "echo run >>'$REPO_TOP/phase'" \
    "sh -c 'echo \$\$ >>\"$REPO_TOP/pids\"; exec sleep 40' &" \
    "[ \"\$(wc -l <'$REPO_TOP/phase')\" -ge $nth ] && sleep 40" \
    'bash run-tests.sh' >"$REPO_TOP/sig.sh"
  before="$(git -C "$REPO" worktree list)"
  : >"$REPO_TOP/phase"
  # A job started with & in a non-interactive shell has SIGINT ignored, and an
  # ignored signal cannot be trapped; a gate run from a terminal does not. perl
  # puts the default back and execs the gate, so the gate is $!.
  TMPDIR="$REPO_TOP/tmp" METHOD_TEST_DEADLINE_S=60 perl -e '$SIG{INT} = "DEFAULT"; exec @ARGV' bash "$GATE" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" \
    -- bash "$REPO_TOP/sig.sh" >"$REPO_TOP/gate.out" 2>"$REPO_TOP/gate.err" &
  local pid=$!
  n=0
  while [ "$(wc -l <"$REPO_TOP/phase" 2>/dev/null | tr -d ' ')" != "$nth" ] && [ "$n" -lt 300 ]; do sleep 0.1; n=$((n + 1)); done
  sleep 0.5
  assert_eq "$nth" "$(wc -l <"$REPO_TOP/phase" | tr -d ' ')" "$label: run $nth had started"
  assert_eq "2" "$(git -C "$REPO" worktree list | wc -l | tr -d ' ')" "$label: the gate's worktree exists mid-run"
  kill "-$sig" "$pid"
  wait "$pid"
  local rc=$?
  assert_eq "1" "$rc" "$label: exit"
  assert_eq "1" "$(grep -cE '^(CLEAN|STAYS_GREEN|TESTS_RED|TESTS_STALLED|ERROR) ' "$REPO_TOP/gate.out")" "$label: one verdict line"
  assert_eq "ERROR interrupted" "$(tail -1 "$REPO_TOP/gate.out")" "$label: last stdout line"
  assert_eq "$before" "$(git -C "$REPO" worktree list)" "$label: git worktree list is as before"
  assert_eq "" "$(ls -A "$REPO_TOP/tmp")" "$label: the temporary directory is removed"
  assert_eq "" "$(git -C "$REPO" status --porcelain)" "$label: DIR is clean"
  sleep 1
  local alive=0 p
  # the signalled run's background child; earlier runs' children are not the gate's to kill
  for p in $(tail -1 "$REPO_TOP/pids" 2>/dev/null); do kill -0 "$p" 2>/dev/null && alive=$((alive + 1)); done
  assert_eq "0" "$alive" "$label: the signalled run's whole process tree is gone"
  drop_repo
}
sig_case "G1 TERM during the control run" TERM 1
sig_case "G2 TERM during a contract run" TERM 2
sig_case "G3 HUP during a contract run" HUP 2
sig_case "G4 INT during the control run" INT 1
sig_case "G5 INT during a contract run" INT 2

# ==== TEST_CMD sees the caller's environment unchanged ====

# env_case LABEL PRINT_EXPR EXPECTED [ENV...]: the control run prints PRINT_EXPR
env_case() {
  local label="$1" expr="$2" want="$3"
  shift 3
  new_repo; write_runner; base_commit; add_effective
  write_contracts "[$C1]"
  env "$@" bash "$GATE" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" \
    -- bash -c "printf 'seen=%s\\n' \"$expr\"" >"$REPO_TOP/gate.out" 2>/dev/null
  assert_eq "$want" "$(grep '^seen=' "$REPO_TOP/gate.out" | head -1)" "$label"
  drop_repo
}
env_case "A1 LC_ALL unset in the caller stays unset" '${LC_ALL-unset}' "seen=unset" -u LC_ALL LANG=en_US.UTF-8
env_case "A1 the supervisor's stall mark is not exported" '${METHOD_BOUNDED_STALL_MARK-unset}' "seen=unset" -u LC_ALL LANG=en_US.UTF-8
env_case "A1 LC_ALL set in the caller keeps its value" '${LC_ALL-unset}' "seen=en_US.UTF-8" LC_ALL=en_US.UTF-8
