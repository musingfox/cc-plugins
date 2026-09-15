#!/usr/bin/env bash
# cf-rebase.sh verifies the tree it is about to hand over.
#
# Every gate in the flow runs before this point: the shard gates test each shard
# branch, the integration gate tests the merged tree, and both happen BEFORE the
# rebase onto a moved base. The same diff over a different base is a different
# tree, and the advisory-fix route reaches delivery with commits no gate saw at
# all — so without this the branch a human fast-forwards was never tested in the
# shape it ships in.
#
#   - rebase clean + suite green                -> OK <sha>
#   - base unmoved + suite green                -> NOOP <sha>
#   - rebase clean + suite red                  -> TESTFAIL <sha> <log>
#   - suite outruns its deadline                -> TESTSTALLED <sha> <log>
#   - no TEST_RUNNER given                      -> OK/NOOP, suite never run

. "$CF_TESTS_DIR/lib/assert.sh"

REBASE="$(cd "$CF_TESTS_DIR/../scripts" && pwd)/cf-rebase.sh"

# build_repo  -> sets SESSION, WORKDIR, REPO; cf branch has one commit on top of
# main, and main has moved on unless MOVE_BASE=no.
build_repo() {
  local move_base="${1:-yes}"
  SESSION="$(mktemp -d)"
  REPO="$SESSION/repo"
  WORKDIR="$SESSION/work"
  mkdir -p "$REPO"

  git -C "$REPO" init -q -b main
  git -C "$REPO" config core.hooksPath /dev/null
  git -C "$REPO" config user.email cf@test.local
  git -C "$REPO" config user.name "cf test"
  git -C "$REPO" config commit.gpgsign false
  printf 'base\n' > "$REPO/base.txt"
  git -C "$REPO" add -A
  git -C "$REPO" commit -q -m "base"

  git -C "$REPO" worktree add -q -b cf/test "$WORKDIR" main
  printf 'shard\n' > "$WORKDIR/shard.txt"
  git -C "$WORKDIR" add -A
  git -C "$WORKDIR" commit -q -m "shard work"

  if [ "$move_base" = yes ]; then
    printf 'moved\n' > "$REPO/moved.txt"
    git -C "$REPO" add -A
    git -C "$REPO" commit -q -m "base moved"
  fi

  cat > "$SESSION/env.sh" <<EOF
SESSION="$SESSION"
SESSION_BASENAME="cf-test"
REPO_ROOT="$REPO"
BASE_BRANCH="main"
BASE_HEAD="HEAD"
EOF
}

# ---- rebase clean, suite green -> OK ----

build_repo yes
out="$(bash "$REBASE" "$SESSION" "true")"
assert_contains "$out" "OK " "green: reports OK"
head="$(git -C "$WORKDIR" rev-parse HEAD)"
assert_contains "$out" "$head" "green: names the rebased head"
base="$(git -C "$REPO" rev-parse main)"
assert_eq "$base" "$(git -C "$WORKDIR" rev-parse HEAD~1)" "green: the branch really sits on the moved base"
rm -rf "$SESSION"

# ---- rebase clean, suite red -> TESTFAIL, and never OK ----

build_repo yes
out="$(bash "$REBASE" "$SESSION" "false")"
assert_contains "$out" "TESTFAIL " "red: reports TESTFAIL"
verdict=silent; case "$out" in OK*|NOOP*) verdict=green ;; esac
assert_eq "silent" "$verdict" "red: a failing delivery tree is never reported as OK"
log="$(printf '%s' "$out" | awk '{print $3}')"
logged=no; [ -f "$log" ] && logged=yes
assert_eq "yes" "$logged" "red: the named log exists for the human to read"
rm -rf "$SESSION"

# ---- the suite runs on the REBASED tree, not the pre-rebase one ----
# The suite passes only when the moved base's file is present, which it is not
# on the shard branch before the rebase.

build_repo yes
out="$(bash "$REBASE" "$SESSION" "test -f moved.txt")"
assert_contains "$out" "OK " "rebased tree: the suite saw the moved base's content"
rm -rf "$SESSION"

# ---- base unmoved: still verified, reported as NOOP with a sha ----

build_repo no
out="$(bash "$REBASE" "$SESSION" "true")"
assert_contains "$out" "NOOP " "unmoved: reports NOOP"
head="$(git -C "$WORKDIR" rev-parse HEAD)"
assert_contains "$out" "$head" "unmoved: names the head being delivered"
rm -rf "$SESSION"

build_repo no
out="$(bash "$REBASE" "$SESSION" "false")"
assert_contains "$out" "TESTFAIL " \
  "unmoved: a red suite still blocks delivery (the advisory-fix route lands here)"
rm -rf "$SESSION"

# ---- a suite that never returns is its own verdict, not a red one ----

build_repo yes
out="$(CF_TEST_DEADLINE_S=1 bash "$REBASE" "$SESSION" "sleep 30")"
assert_contains "$out" "TESTSTALLED " "stalled: reports TESTSTALLED"
rm -rf "$SESSION"

# ---- no TEST_RUNNER: old behaviour, no suite run ----

build_repo yes
out="$(bash "$REBASE" "$SESSION")"
assert_contains "$out" "OK " "no runner: still reports OK"
ran=no; [ -f "$SESSION/rebase-test.log" ] && ran=yes
assert_eq "no" "$ran" "no runner: nothing was executed"
rm -rf "$SESSION"
