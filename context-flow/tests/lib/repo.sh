#!/usr/bin/env bash
# Fixture helpers for the gate tests. Sourced after lib/assert.sh; sets no trap,
# so assert.sh's EXIT trap stays the one that reports failures.
#
#   new_repo            REPO = a fresh `git init` under mktemp -d (hooks off)
#   commit_all MSG      stage everything in REPO and commit it
#   head_sha            the sha REPO's HEAD points at
#   write_contracts JSON_ARRAY   REPO/../contracts.json = a schema 1 file
#   snapshot            everything a gate must leave alone, as text
#   without_jq          a PATH with every command but jq in it
#   drop_repo           remove REPO and its contracts file

new_repo() {
  REPO_TOP="$(mktemp -d)"
  REPO="$REPO_TOP/repo"
  CONTRACTS="$REPO_TOP/contracts.json"
  OUT="$REPO_TOP/out"
  mkdir -p "$REPO"
  git -C "$REPO" init -q -b main
  git -C "$REPO" config core.hooksPath /dev/null
  git -C "$REPO" config user.email t@t
  git -C "$REPO" config user.name t
}

commit_all() {
  git -C "$REPO" add -A && git -C "$REPO" commit -qm "$1"
}

head_sha() { git -C "$REPO" rev-parse HEAD; }

write_contracts() {
  printf '{"schema_version":1,"contracts":%s}\n' "$1" >"$CONTRACTS"
}

drop_repo() { rm -rf "$REPO_TOP"; }

# snapshot: HEAD and refs, stash, worktree list, index bytes, the index as git
# reads it, the status of the checkout and the bytes of every file in it.
snapshot() {
  {
    git -C "$REPO" symbolic-ref -q HEAD || echo detached
    git -C "$REPO" for-each-ref
    git -C "$REPO" stash list
    git -C "$REPO" worktree list
    shasum "$REPO/.git/index"
    git -C "$REPO" ls-files -s
    git -C "$REPO" status --porcelain --ignored
    (cd "$REPO" && find . -path ./.git -prune -o -type f -print | sort | xargs shasum)
  } 2>&1
}

# dirty_repo: a checkout with something in every place a gate could disturb --
# a branch, a tag, a stash entry, a modified tracked file, a staged file and an
# untracked one. Callers commit their base first.
dirty_repo() {
  git -C "$REPO" branch side
  git -C "$REPO" tag v0
  echo stashed >>"$REPO/keep.txt"
  git -C "$REPO" stash -q
  echo modified >>"$REPO/keep.txt"
  echo staged >"$REPO/staged.txt"
  git -C "$REPO" add staged.txt
  echo untracked >"$REPO/untracked.txt"
}

# without_jq: echoes a directory of symlinks to every command a gate may use
# except jq, for PATH. A gate must still print its error with only that.
without_jq() {
  local d="$REPO_TOP/nojq" c p
  mkdir -p "$d"
  for c in git bash sh sed sort comm grep tr cat dirname basename mktemp rm mkdir paste cut head tail wc date perl python3 env cp mv ls awk xargs shasum find cmp; do
    p="$(command -v "$c" 2>/dev/null)" && [ -x "$p" ] && ln -sf "$p" "$d/$c"
  done
  printf '%s' "$d"
}
