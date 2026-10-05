#!/usr/bin/env bash
# cf-pi-run.sh step 13: a shard is promoted only when every contract's tests go
# red with the shard's own implementation reverted.
#
# Fixture F (real git) driven through the real cf-pi-run.sh. Siblings resolved
# through $SCRIPTS are stubbed; the revert gate, like the scope gate, comes from
# $SCRIPT_DIR and is real. `sleep` is stubbed on PATH, git is not.

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"

RUN="$REAL_SCRIPTS/cf-pi-run.sh"

# build_fixture [--empty] CONTRACT...   C1 = effective, C2 = vacuous.
# --empty declares the contracts but commits nothing beyond BASE_HEAD.
# Sets FLOW, SHARD, WORK, STUBS.
build_fixture() {
  local commit=yes c touches docs="" names="" files="" claims=""
  if [ "$1" = --empty ]; then commit=no; shift; fi
  FLOW="$(mktemp -d)"; SHARD="$FLOW/shards/A"; WORK="$SHARD/work"; STUBS="$FLOW/stubs"
  mkdir -p "$WORK/src" "$WORK/tests" "$STUBS"
  git -C "$WORK" init -q -b main
  git -C "$WORK" config core.hooksPath /dev/null
  git -C "$WORK" config user.email t@t
  git -C "$WORK" config user.name t
  printf '%s\n' 'for f in tests/*.test.sh; do bash "$f" || exit 1; done' >"$WORK/run-tests.sh"
  printf '%s\n' 'echo base' >"$WORK/src/base.sh"
  printf '%s\n' '[ "$(bash src/base.sh)" = base ]' >"$WORK/tests/base.test.sh"
  git -C "$WORK" add -A && git -C "$WORK" commit -qm base
  local base; base="$(git -C "$WORK" rev-parse HEAD)"

  for c in "$@"; do
    case "$c" in
      C1)
        if [ "$commit" = yes ]; then
          printf '%s\n' 'echo $(($1 + $2))' >"$WORK/src/add.sh"
          printf '%s\n' '[ "$(bash src/add.sh 2 3)" = 5 ]' >"$WORK/tests/add.test.sh"
        fi
        touches='"src/add.sh","tests/add.test.sh"' ;;
      C2)
        if [ "$commit" = yes ]; then
          printf '%s\n' 'echo $(($1 * $2))' >"$WORK/src/mul.sh"
          printf '%s\n' 'exit 0' >"$WORK/tests/mul.test.sh"
        fi
        touches='"src/mul.sh","tests/mul.test.sh"' ;;
    esac
    if [ "$commit" = yes ]; then git -C "$WORK" add -A && git -C "$WORK" commit -qm "$c"; fi
    docs="$docs,{\"name\":\"$c\",\"touches_files\":[$touches]}"
    files="$files,$touches"
    names="$names,\"$c\""
    claims="$claims- Implemented $c _(contract: $c)_
"
  done
  printf '{"schema_version":1,"contracts":[%s]}\n' "${docs#,}" >"$FLOW/contracts.json"
  printf '{"groups":{"A":{"contracts":[%s],"files":[%s]}}}\n' "${names#,}" "${files#,}" >"$FLOW/shards.json"

  cat >"$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-shard-A"
PLUGIN_ROOT="$FLOW"
SCRIPTS="$STUBS"
FLOW_SESSION="$FLOW"
SHARD_ID="A"
PI_DISPATCH_CMD=""
PI_STALL_THRESHOLD_S=180
PI_WALL_CLOCK_S=1800
REPO_ROOT="$WORK"
BASE_BRANCH="main"
BASE_HEAD="$base"
EOF

  for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh; do
    printf '#!/bin/bash\nexit 0\n' >"$STUBS/$s"
  done
  printf '#!/bin/bash\necho OK\n' >"$STUBS/cf-pi-probe.sh"
  printf '#!/bin/bash\necho "pm"\n' >"$STUBS/cf-pi-postmortem.sh"
  printf '#!/bin/bash\necho "STATUS=OK"\n' >"$STUBS/cf-pi-poll.sh"
  printf '#!/bin/bash\necho "test_exit=0"\nexit 0\n' >"$STUBS/cf-pi-test.sh"
  # The worker's report claims every declared contract.
  cat >"$STUBS/cf-pi-dispatch.sh" <<EOF
#!/bin/bash
cat > "$SHARD/implement-report.md" <<'REPORT'
## Summary
Did the work.

## Completed
$claims
REPORT
echo 12345
EOF
  printf '#!/bin/bash\nexit 0\n' >"$STUBS/sleep"
  chmod +x "$STUBS"/*
  export PI_RUNS_DIR="$FLOW/runs"
}

# run_shard [RUN_SCRIPT] [TEST_RUNNER] -> RC
run_shard() {
  PATH="$STUBS:$PATH" bash "${1:-$RUN}" "$SHARD" goal none "${2:-bash run-tests.sh}" >"$FLOW/run.log" 2>&1
  RC=$?
}

section() { sed -n "/^## $1\$/{n;p;q;}" "$SHARD/outcome.md" 2>/dev/null; }
list_of() { sed -n "/^## $1/,/^\$/p" "$SHARD/outcome.md" 2>/dev/null; }
has() { case "$1" in *"$2"*) echo yes ;; *) echo no ;; esac; }

# ==== a contract green without its implementation blocks promotion ====

# T1: vacuous C2
build_fixture C2
run_shard
assert_eq "2" "$RC" "T1 vacuous: exit"
assert_eq "NEEDS_REPLAN" "$(section Status)" "T1 vacuous: Status"
assert_eq "tests-green-on-revert" "$(section Reason)" "T1 vacuous: Reason"
assert_contains "$(list_of 'Affected contracts')" "C2: tests-green-on-revert" "T1 vacuous: Affected"
assert_eq "tests stay green with the implementation reverted: C2" "$(section Cause)" "T1 vacuous: Cause"

# T5: the diff is taken from the unreverted tree, and the gate restores it
assert_contains "$(cat "$SHARD/implement.diff" 2>/dev/null)" '+echo $(($1 * $2))' "T5 diff carries the implementation"
assert_eq "" "$(git -C "$WORK" status --porcelain -- src tests)" "T5 own paths restored"
rm -rf "$FLOW"

# T2: effective C1 survives, vacuous C2 is flagged
build_fixture C1 C2
run_shard
assert_eq "2" "$RC" "T2 mixed: exit"
assert_eq "yes no" "$(has "$(list_of 'Survived contracts')" C1) $(has "$(list_of 'Survived contracts')" C2)" \
  "T2 mixed: Survived lists C1, not C2"
assert_eq "no yes" "$(has "$(list_of 'Affected contracts')" C1) $(has "$(list_of 'Affected contracts')" C2)" \
  "T2 mixed: Affected lists C2, not C1"
rm -rf "$FLOW"

# T3: effective C1 alone passes
build_fixture C1
run_shard
assert_eq "0" "$RC" "T3 effective: exit"
assert_eq "PASS" "$(section Status)" "T3 effective: Status"
rm -rf "$FLOW"

# T4: a revert gate planted in $SCRIPTS is never the one that runs
stub_gate() { printf '#!/bin/bash\necho "CLEAN 1"\nexit 0\n' >"$STUBS/cf-pi-revert-gate.sh"; chmod +x "$STUBS/cf-pi-revert-gate.sh"; }
build_fixture C2; stub_gate
run_shard
assert_eq "2" "$RC" "T4 stubbed \$SCRIPTS gate: exit"
assert_eq "tests-green-on-revert" "$(section Reason)" "T4 stubbed \$SCRIPTS gate: Reason"
rm -rf "$FLOW"

# T8: a shard that committed nothing but claims C1
build_fixture --empty C1
assert_eq "0" "$(git -C "$WORK" rev-list --count "$(sed -n 's/^BASE_HEAD="\(.*\)"$/\1/p' "$SHARD/env.sh")..HEAD")" \
  "T8 fixture has no commits beyond BASE_HEAD"
run_shard
assert_eq "2" "$RC" "T8 empty shard: exit"
assert_eq "tests-green-on-revert" "$(section Reason)" "T8 empty shard: Reason"
assert_contains "$(list_of 'Affected contracts')" "C1: tests-green-on-revert" "T8 empty shard: Affected"
rm -rf "$FLOW"

# T9: red first
build_fixture C2; stub_gate
fx_mutant 's/"\$SCRIPT_DIR\/cf-pi-revert-gate\.sh"/"\$SCRIPTS\/cf-pi-revert-gate.sh"/'
run_shard "$MUT"
assert_eq "0 PASS" "$RC $(section Status)" "T9 gate through \$SCRIPTS: T4 ends PASS"
rm -rf "$FLOW"

STEP13='s/\n# -------- 13\. .*?\n(?=# All contracts this shard declared)/\n/s'
build_fixture C2
fx_mutant "$STEP13"
run_shard "$MUT"
assert_eq "0 PASS" "$RC $(section Status)" "T9 no step 13: T1 ends PASS"
rm -rf "$FLOW"

build_fixture --empty C1
fx_mutant "$STEP13"
run_shard "$MUT"
assert_eq "0 PASS" "$RC $(section Status)" "T9 no step 13: T8 ends PASS"
rm -rf "$FLOW"

# ==== a gate that reaches no verdict fails the shard ====

# T1: the suite is already red on the untouched tree
build_fixture C1
run_shard "$RUN" false
assert_eq "1" "$RC" "error T1 control red: exit"
assert_eq "FAIL" "$(section Status)" "error T1 control red: Status"
assert_eq "revert-gate-error" "$(section Reason)" "error T1 control red: Reason"
assert_eq "ERROR control-red" "$(section Cause)" "error T1 control red: Cause"
assert_contains "$(list_of 'Affected contracts')" "(all): ERROR control-red" "error T1 control red: Affected"
rm -rf "$FLOW"

# A git failure mid-revert ends the gate under set -e before any verdict line.
# The first read-tree fails; later git calls, the restore's included, work.
build_fixture C1
printf '%s\n' 'echo base' '# edited' >"$WORK/src/base.sh"
git -C "$WORK" add -A && git -C "$WORK" commit -qm "touch a base file"
jq '.groups.A.files += ["src/base.sh"]' "$FLOW/shards.json" >"$FLOW/shards.tmp" && mv "$FLOW/shards.tmp" "$FLOW/shards.json"
mkdir -p "$FLOW/gitwrap"
cat >"$FLOW/gitwrap/git" <<WRAP
#!/bin/bash
case " \$* " in
  *" read-tree "*) [ -e "$FLOW/read-tree.failed" ] || { : >"$FLOW/read-tree.failed"; exit 128; } ;;
esac
exec "$(command -v git)" "\$@"
WRAP
chmod +x "$FLOW/gitwrap/git"
PATH="$FLOW/gitwrap:$PATH" run_shard
assert_eq "" "$(cat "$SHARD/revert-gate.out" 2>/dev/null)" "error no verdict (git): the gate printed nothing"
assert_eq "1 FAIL revert-gate-error" "$RC $(section Status) $(section Reason)" "error no verdict (git): FAIL revert-gate-error"
assert_contains "$(section Cause)" "without a verdict" "error no verdict (git): Cause"
rm -rf "$FLOW"

# Exit 2 without a STAYS_GREEN line names no contract (bash exits 2 on a syntax
# error): not a verdict either. A copy of cf-pi-run.sh whose sibling gate does that.
build_fixture C1
fx_script_dir "$FLOW/sd"
cp "$RUN" "$FLOW/sd/cf-pi-run.sh"
rm "$FLOW/sd/cf-pi-revert-gate.sh"
printf '#!/bin/bash\nexit 2\n' >"$FLOW/sd/cf-pi-revert-gate.sh"
chmod +x "$FLOW/sd/cf-pi-revert-gate.sh"
run_shard "$FLOW/sd/cf-pi-run.sh"
assert_eq "1 FAIL revert-gate-error" "$RC $(section Status) $(section Reason)" "error no verdict (exit 2): FAIL revert-gate-error"
rm -rf "$FLOW"

# T3: red first, routing gate exit 1 to PASS lets T1 through
build_fixture C1
fx_mutant 's/(case "\$GATE_RC:\$gate_line" in\n)/${1}  1:*) ;;\n/'
run_shard "$MUT" false
assert_eq "0 PASS" "$RC $(section Status)" "error T3 exit 1 routed to PASS: T1 ends PASS"
rm -rf "$FLOW"

# One reader of revert-gate.out's ERROR line: derive_cause and step 13 quote
# the same text, so Cause and Affected cannot drift apart.
assert_eq "1" "$(grep -c 'without a verdict' "$REAL_SCRIPTS/cf-pi-run.sh")" "revert-gate.out ERROR fallback written once"
