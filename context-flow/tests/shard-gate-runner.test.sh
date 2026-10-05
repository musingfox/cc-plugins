#!/usr/bin/env bash
# The shard gates run TEST_RUNNER through `bash -c`, as the integration gate
# does, and a blank runner is refused before anything runs. NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"

RUN="$REAL_SCRIPTS/cf-pi-run.sh"
CHAIN="true && MARK='SECOND SUITE RAN' printenv MARK && bash tests/x.test.sh"

section() { sed -n "/^## $1\$/{n;p;q;}" "$SHARD/outcome.md" 2>/dev/null; }
count_of() { grep -c "$1" "$2" 2>/dev/null || true; }

# mutant PERL_SUBSTITUTION -> MUT: a copy of cf-pi-run.sh with that one change,
# next to links to every sibling it resolves through $SCRIPT_DIR.
mutant() {
  local s applied=yes
  MUTDIR="$(mktemp -d)"
  for s in cf-pi-env.sh cf-pi-prepare.sh cf-pi-scope.sh cf-pi-revert-gate.sh; do
    ln -s "$REAL_SCRIPTS/$s" "$MUTDIR/$s"
  done
  MUT="$MUTDIR/cf-pi-run.sh"
  perl -0777 -pe "$1" "$RUN" >"$MUT"
  cmp -s "$RUN" "$MUT" && applied=no
  assert_eq "yes" "$applied" "mutation applies: $1"
}

# wired_build: real repo, real scripts, a shard prepared with a non-blank
# runner, one commit and a report claiming C1. Sets TMP REPO FLOW SHARD W.
wired_build() {
  TMP="$(mktemp -d)"
  REPO="$TMP/repo"
  FLOW="$TMP/flow"
  mkdir -p "$REPO" "$FLOW"
  git -C "$REPO" init -q -b main && git -C "$REPO" config core.hooksPath /dev/null
  git -C "$REPO" config user.email t@t && git -C "$REPO" config user.name t
  echo base > "$REPO/base.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm base
  cat > "$FLOW/contracts.json" <<'JSON'
{"schema_version": 1, "flow_id": "t",
 "contracts": [{"name": "C1", "touches_files": ["src/x.txt", "tests/x.test.sh"]}]}
JSON
  cat > "$FLOW/env.sh" <<ENV
SESSION="$FLOW"
SESSION_BASENAME="$(basename "$FLOW")"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$REAL_SCRIPTS"
PI_PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
PI_DESC="test"
PI_STALL_THRESHOLD_S="180"
PI_WALL_CLOCK_S="1800"
PI_AVAILABLE="1"
ENV
  touch "$FLOW/cleanup.sh"
  "$REAL_SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
  SHARD="$FLOW/shards/A"
  ( cd "$REPO" && bash "$RUN" --prepare-only "$SHARD" goal none 'bash tests/x.test.sh' ) \
    > "$TMP/prepare.log" 2>&1
  W="$SHARD/work"
  mkdir -p "$W/src" "$W/tests"
  echo hello > "$W/src/x.txt"
  echo 'grep -q hello src/x.txt' > "$W/tests/x.test.sh"
  git -C "$W" add -A && git -C "$W" commit -qm "add x"
  printf '## Summary\nDone.\n\n## Completed\n- Wrote x _(contract: C1)_\n' > "$SHARD/implement-report.md"
}

# wired_gates SCRIPT RUNNER -> RC
wired_gates() {
  ( cd "$REPO" && bash "$1" --gates-only "$SHARD" goal none "$2" ) > "$TMP/gates.log" 2>&1
  RC=$?
}

wired_clean() {
  git -C "$REPO" worktree remove --force "$W" >/dev/null 2>&1
  rm -rf "$TMP" "${MUTDIR:-}"
  MUTDIR=
}

# G1: the runner is one shell command line, so a `&&` chain runs every part
wired_build
wired_gates "$RUN" "$CHAIN"
assert_eq "1" "$(count_of 'SECOND SUITE RAN' "$SHARD/test-output.log")" "G1 second suite ran in gate 3"
assert_eq "0" "$RC" "R1 exit"
assert_eq "PASS" "$(section Status)" "R1 Status"
assert_eq "CLEAN 1" "$(head -1 "$SHARD/revert-gate.out")" "R1 revert gate verdict"
marked=$(awk '/^### /{sec=substr($0,5)} /SECOND SUITE RAN/{print sec}' "$SHARD/revert-gate.log" | sort -u | tr '\n' ' ')
assert_eq "C1 control " "$marked" "R1 control and contract runs ran the second suite"
wired_clean

# G2: unquoted, the chain is one argv for `true`, so the second suite never runs
wired_build
mutant 's/ bash -c "\$TEST_RUNNER"/ \$TEST_RUNNER/g'
wired_gates "$MUT" "$CHAIN"
assert_eq "0" "$(count_of 'SECOND SUITE RAN' "$SHARD/test-output.log")" "G2 mutant never ran the second suite"
assert_eq "2" "$RC" "R2 exit"
assert_eq "NEEDS_REPLAN" "$(section Status)" "R2 Status"
assert_eq "tests-green-on-revert" "$(section Reason)" "R2 Reason"
assert_eq "STAYS_GREEN C1" "$(head -1 "$SHARD/revert-gate.out")" "R2 revert gate verdict"
assert_eq "0" "$(count_of 'SECOND SUITE RAN' "$SHARD/revert-gate.log")" "R2 mutant never ran the second suite in the revert gate"
wired_clean

# G3: a red chain takes the red-suite path
wired_build
wired_gates "$RUN" "true && false"
assert_eq "3" "$RC" "G3 exit"
assert_contains "$(tail -1 "$TMP/gates.log")" "REBRIEF tests " "G3 re-brief"
assert_contains "$(cat "$SHARD/gate3.out")" "test_exit=1" "G3 test_exit"
wired_clean

# ==== a blank runner is refused before anything runs ====

NO_BLANK_GUARD='s/case "\$TEST_RUNNER" in\n  \*\[!\[:space:\]\]\*\) ;;.*?\nesac\n//s'
has() { case "$1" in *"$2"*) echo yes ;; *) echo no ;; esac; }

# B1
fx_build
fx_run --prepare-only "$SHARD" goal none ""
assert_eq "1" "$RC" "B1 exit"
assert_eq "FAIL" "$(section Status)" "B1 Status"
assert_eq "test-runner-missing" "$(section Reason)" "B1 Reason"
assert_eq absent "$(fx_exists "$FLOW/worktree.count")" "B1 no worktree"
assert_eq absent "$(fx_exists "$FLOW/brief.count")" "B1 no brief"
assert_eq "no" "$(has "$OUT" PREPARED)" "B1 no PREPARED line"
assert_eq "[shard A] FAIL test-runner-missing" "$(fx_last)" "B1 stdout line"
assert_contains "$(section Cause)" "SHARD_TEST_RUNNER" "C2 Cause names SHARD_TEST_RUNNER"
fx_clean

# B2
fx_build
fx_run "$SHARD" goal none ""
assert_eq "1" "$RC" "B2 exit"
assert_eq "test-runner-missing" "$(section Reason)" "B2 Reason"
assert_eq absent "$(fx_exists "$FLOW/probe.count")" "B2 no probe"
assert_eq absent "$(fx_exists "$FLOW/dispatch.count")" "B2 no dispatch"
fx_clean

# B3
fx_build
fx_report valid
fx_run --gates-only "$SHARD" goal none ""
assert_eq "1" "$RC" "B3 exit"
assert_eq "test-runner-missing" "$(section Reason)" "B3 Reason"
assert_eq absent "$(fx_exists "$FLOW/test.count")" "B3 no gate 3"
assert_eq absent "$(fx_exists "$SHARD/revert-gate.log")" "B3 no revert gate"
fx_clean

# B4: whitespace only is blank
fx_build
fx_report valid
fx_run --gates-only "$SHARD" goal none "   "
assert_eq "1" "$RC" "B4 exit"
assert_eq "test-runner-missing" "$(section Reason)" "B4 Reason"
assert_eq absent "$(fx_exists "$FLOW/test.count")" "B4 no gate 3"
fx_clean

# B5: a blank TEST_RUNNER in the shard env.sh overrides the argument
fx_build
fx_report valid
printf 'TEST_RUNNER=""\n' >> "$SHARD/env.sh"
fx_run --gates-only "$SHARD" goal none true
assert_eq "1" "$RC" "B5 exit"
assert_eq "test-runner-missing" "$(section Reason)" "B5 Reason"
assert_eq absent "$(fx_exists "$FLOW/test.count")" "B5 no gate 3"
fx_clean

# B6: without the guard the same blank prepare goes through
fx_build
mutant "$NO_BLANK_GUARD"
assert_eq "no" "$(has "$(cat "$MUT")" 'write_outcome FAIL test-runner-missing')" "B6 mutant has no guard"
OUT="$(PATH="$STUBS:$PATH" bash "$MUT" --prepare-only "$SHARD" goal none "" 2>"$FLOW/run.err")"
RC=$?
assert_eq "0" "$RC" "B6 mutant exit"
assert_eq "PREPARED $SHARD/implement-brief.md" "$(fx_last)" "B6 mutant last line"
rm -rf "$MUTDIR"; fx_clean

# B7: without the guard a blank runner passes gate 3 and every contract stays green
wired_build
mutant "$NO_BLANK_GUARD"
wired_gates "$MUT" ""
assert_eq "2" "$RC" "B7 mutant exit"
assert_eq "tests-green-on-revert" "$(section Reason)" "B7 mutant Reason"
assert_contains "$(cat "$SHARD/gate3.out")" "test_exit=0" "B7 mutant gate 3 green"
assert_eq "STAYS_GREEN C1" "$(head -1 "$SHARD/revert-gate.out")" "B7 mutant revert gate"
wired_clean
