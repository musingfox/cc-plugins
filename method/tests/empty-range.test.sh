#!/usr/bin/env bash
# A range with no commit is not a clean builder, it is no evidence: when
# base..head holds no commit (base equal to head, or base a descendant of head)
# both gates print exactly one `ERROR empty-range` line and exit 1, and the
# revert gate runs no suite. A diverged base, where head has commits of its own,
# is a range like any other.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"
. "$METHOD_TESTS_DIR/lib/repo.sh"

SCRIPTS="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)"

# fixture: base commit, then one commit adding src/a.sh and tests/a.sh; C1 touches both
fixture() {
  new_repo
  echo readme >"$REPO/README"
  commit_all base
  BASE="$(head_sha)"
  mkdir -p "$REPO/src" "$REPO/tests"
  echo 'echo a' >"$REPO/src/a.sh"
  echo '[ "$(bash src/a.sh)" = a ]' >"$REPO/tests/a.sh"
  commit_all work
  WORK="$(head_sha)"
  write_contracts '[{"name":"C1","touches_files":["src/a.sh","tests/a.sh"],"test_files":["tests/a.sh"]}]'
}

# run_scope BASE HEAD / run_revert BASE HEAD -> OUT_TXT, RC
run_scope() {
  OUT_TXT="$(bash "$SCRIPTS/scope-gate.sh" --repo "$REPO" --base "$1" --head "$2" --contracts "$CONTRACTS" 2>/dev/null)"
  RC=$?
}
run_revert() {
  rm -f "$REPO_TOP/ran"
  OUT_TXT="$(bash "$SCRIPTS/revert-gate.sh" --repo "$REPO" --base "$1" --head "$2" --contracts "$CONTRACTS" --out "$OUT" \
    -- bash -c ": >'$REPO_TOP/ran'" 2>/dev/null)"
  RC=$?
}

# empty_case LABEL BASE HEAD: both gates refuse the range
empty_case() {
  fixture
  local b h
  case "$2" in work) b="$WORK" ;; base) b="$BASE" ;; child) git -C "$REPO" commit -q --allow-empty -m child; b="$(head_sha)" ;; esac
  case "$3" in work) h="$WORK" ;; base) h="$BASE" ;; esac
  run_scope "$b" "$h"
  assert_eq "ERROR empty-range" "$OUT_TXT" "$1 scope: stdout is the lone ERROR line"
  assert_eq "1" "$RC" "$1 scope: exit"
  run_revert "$b" "$h"
  assert_eq "ERROR empty-range" "$OUT_TXT" "$1 revert: stdout is the lone ERROR line"
  assert_eq "1" "$RC" "$1 revert: exit"
  assert_eq "absent" "$([ -e "$REPO_TOP/ran" ] && echo present || echo absent)" "$1 revert: no suite ran"
  assert_eq "1" "$(git -C "$REPO" worktree list | wc -l | tr -d ' ')" "$1 revert: no worktree left"
  drop_repo
}

empty_case "A3 base equal to head" work work
empty_case "A3 base is head's child" child work

# a diverged base: base is not an ancestor of head, but head has commits of its own
fixture
git -C "$REPO" checkout -q -b side "$BASE"
echo other >"$REPO/other.txt"
commit_all side
SIDE="$(head_sha)"
run_scope "$SIDE" "$WORK"
assert_eq "0" "$RC" "A3 diverged base scope: exit"
assert_eq "" "$OUT_TXT" "A3 diverged base scope: stdout"
run_revert "$SIDE" "$WORK"
assert_eq "present" "$([ -e "$REPO_TOP/ran" ] && echo present || echo absent)" "A3 diverged base revert: the suite ran"
case "$OUT_TXT" in *"ERROR empty-range"*) _assert_fail "A3 diverged base revert: refused as empty" ;; *) _assert_pass ;; esac
drop_repo
