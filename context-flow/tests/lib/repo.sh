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

# ---- the suite fixture the revert gate tests share ----
# Base commit: run-tests.sh (runs tests/*.test.sh), src/base.sh, tests/base.test.sh.
#   write_runner [GUARD_LINE]   run-tests.sh, with an optional first line
#   base_commit                 commits the base; sets BASE
#   add_effective               c1: src/add.sh + a test that fails without it
#   add_vacuous [test-only]     c2: src/mul.sh + a test that is always green
#   gate_run CMD [ARGS...]      the revert gate over REPO..HEAD -> GATE_OUT, GATE_RC
# GATE and BASE are the caller's; gate_run runs the script in $GATE.

write_runner() {
  mkdir -p "$REPO/src" "$REPO/tests"
  {
    [ -z "${1:-}" ] || printf '%s\n' "$1"
    printf '%s\n' 'for f in tests/*.test.sh; do bash "$f" || exit 1; done'
  } >"$REPO/run-tests.sh"
}

base_commit() {
  mkdir -p "$REPO/src" "$REPO/tests"
  printf '%s\n' 'echo base' >"$REPO/src/base.sh"
  printf '%s\n' '[ "$(bash src/base.sh)" = base ]' >"$REPO/tests/base.test.sh"
  commit_all base
  BASE="$(head_sha)"
}

add_effective() {
  printf '%s\n' 'echo $(($1 + $2))' >"$REPO/src/add.sh"
  printf '%s\n' '[ "$(bash src/add.sh 2 3)" = 5 ]' >"$REPO/tests/add.test.sh"
  commit_all c1
}

add_vacuous() {
  [ "${1:-}" = test-only ] || printf '%s\n' 'echo $(($1 * $2))' >"$REPO/src/mul.sh"
  printf '%s\n' 'exit 0' >"$REPO/tests/mul.test.sh"
  commit_all c2
}

C1='{"name":"C1","touches_files":["src/add.sh","tests/add.test.sh"]}'
C2='{"name":"C2","touches_files":["src/mul.sh","tests/mul.test.sh"]}'

gate_run() {
  GATE_OUT="$(bash "$GATE" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" -- "$@" 2>"$REPO_TOP/gate.err")"
  GATE_RC=$?
  GATE_LAST="$(printf '%s\n' "$GATE_OUT" | tail -1)"
}
