#!/usr/bin/env bash
# Self-test for .githooks/commit-msg. Invokes the hook with sh against message
# files in a temp dir; never edits the hook.

set -uo pipefail

# A caller's GIT_* must not steer this test or rewrite that repo's config.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$REPO/.githooks/commit-msg"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

RC=0
run_hook() {
  local hook=$1
  shift
  local f="$TMP/msg"
  if [ "$#" -eq 0 ]; then
    : > "$f"
  else
    printf '%s\n' "$@" > "$f"
  fi
  sh "$hook" "$f" >"$TMP/out" 2>"$TMP/err"
  RC=$?
}

check_accept() {
  run_hook "$1" "$2"
  [ "$RC" -eq 0 ]
}

check_reject() {
  run_hook "$1" "$2"
  [ "$RC" -eq 1 ] || return 1
  [ "$(sed -n '1p' "$TMP/err")" = "commit-msg: subject is not a Conventional Commit." ] || return 1
  grep -Fxq "  got:      $2" "$TMP/err"
}

note() {
  if "$@"; then ok "$SUBJ"; else bad "$SUBJ"; fi
}

# Well-formed type[(scope)][!]: description subjects.
types='feat fix docs style refactor perf test build ci chore revert'
for t in $types; do
  SUBJ="$t: x"
  note check_accept "$HOOK" "$SUBJ"
done
SUBJ="feat(spiral): add x"; note check_accept "$HOOK" "$SUBJ"
SUBJ="fix!: x"; note check_accept "$HOOK" "$SUBJ"
SUBJ="feat(a/b.c_d-1)!: x"; note check_accept "$HOOK" "$SUBJ"

# Line 1 decides; the body cannot save or sink the subject.
check_lines() {
  local expect=$1
  shift
  run_hook "$HOOK" "$@"
  [ "$RC" -eq "$expect" ]
}
SUBJ="feat: x then wip: body"
note check_lines 0 "feat: x" "wip: body"
SUBJ="wip: x then feat: body"
note check_lines 1 "wip: x" "feat: body"

# Subjects git and the fixup workflow write themselves, exact prefix only.
for SUBJ in \
  "fixup! feat: x" \
  "squash! x" \
  "Merge branch 'x'" \
  "Revert \"feat: x\"" \
  "# comment-only"
do
  note check_accept "$HOOK" "$SUBJ"
done
SUBJ="empty message"
note check_lines 0
for SUBJ in "fixup!x" "Merge" "merge x"; do
  note check_lines 1 "$SUBJ"
done

echo "--- commit-msg: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && [ "$PASS" -gt 0 ]
