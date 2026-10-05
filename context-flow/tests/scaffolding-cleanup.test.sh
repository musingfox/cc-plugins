#!/usr/bin/env bash
# cf.md "Scaffolding leaves no trace": the success-path block removes the
# integration worktree and branch that cf-pi-integrate.sh left behind, but only
# when the integrated tree is what landed on cf/<slug>.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

CLEANUP_BLOCK=$(awk '/^### Scaffolding leaves no trace/{f=1} f&&/^```bash/{b=1;next} b&&/^```/{exit} b' "$CF_TESTS_DIR/../commands/cf.md")
TMP="$(mktemp -d /tmp/cf-scaffold-XXXXXX)"
SLUG=t

# build NAME LANDED_CONTENT: repo whose cf/t-integrated (checked out at
# $FLOW/integrated-work, as cf-pi-integrate.sh leaves it) holds a.txt=A, and
# whose cf/t holds a.txt=LANDED_CONTENT on a different commit.
build() {
  REPO="$TMP/$1/repo"; FLOW="$TMP/$1/flow"
  mkdir -p "$REPO" "$FLOW"
  git -C "$REPO" init -q -b main && git -C "$REPO" config core.hooksPath /dev/null
  git -C "$REPO" config user.email t@t && git -C "$REPO" config user.name t
  git -C "$REPO" commit -q --allow-empty -m base
  git -C "$REPO" branch "cf/$SLUG-shard-A"
  git -C "$REPO" worktree add -q -b "cf/$SLUG-integrated" "$FLOW/integrated-work" main
  echo A > "$FLOW/integrated-work/a.txt"
  git -C "$FLOW/integrated-work" add -A && git -C "$FLOW/integrated-work" commit -qm "merge shard A"
  git -C "$REPO" checkout -q -b "cf/$SLUG" main
  echo "$2" > "$REPO/a.txt"
  git -C "$REPO" add -A && git -C "$REPO" commit -qm "landed A"
  git -C "$REPO" checkout -q main
}
SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
run_block() { (cd "$REPO" && SESSION="$FLOW" CF_SLUG="$SLUG" && eval "$CLEANUP_BLOCK") 2>&1; }

# --- T0: the block main pastes into Bash carries no literal `git branch -D` --
# guard-bash.sh sees only the command text: it cannot resolve
# "cf/$CF_SLUG-integrated" or "$b", so it blocks the whole cleanup.
assert_eq no "$(printf '%s' "$CLEANUP_BLOCK" | grep -q 'branch -D' && echo yes || echo no)" "T0 cleanup block has no git branch -D"
has_branch() { git -C "$REPO" rev-parse -q --verify "refs/heads/$1" >/dev/null && echo yes || echo no; }
has_worktree() { git -C "$REPO" worktree list --porcelain | grep -q "integrated-work$" && echo yes || echo no; }

# --- T1: integrated tree equals the landing: worktree and branch both go -----
build same A
run_block >/dev/null
assert_eq no "$(has_worktree)" "T1 integration worktree removed"
assert_eq no "$(has_branch "cf/$SLUG-integrated")" "T1 integration branch deleted"
assert_eq no "$(has_branch "cf/$SLUG-shard-A")" "T1 shard branch deleted"
assert_eq yes "$(has_branch "cf/$SLUG")" "T1 deliverable branch kept"
assert_eq no "$([ -e "$FLOW/integrated-work" ] && echo yes || echo no)" "T1 integration checkout gone from disk"

# --- T2: trees differ: the integrated work is not provably on cf/<slug> ------
build differ B
out=$(run_block)
assert_eq yes "$(has_worktree)" "T2 integration worktree kept"
assert_eq yes "$(has_branch "cf/$SLUG-integrated")" "T2 integration branch kept"
assert_contains "$out" "cf/$SLUG-integrated" "T2 the kept branch is named"
assert_eq no "$(has_branch "cf/$SLUG-shard-A")" "T2 shard branch still deleted"

rm -rf "$TMP"
