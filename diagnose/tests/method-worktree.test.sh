#!/usr/bin/env bash
# Guard: diagnosis runs in a throwaway worktree that every exit path removes.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

n=$(grep -c 'diagnose/<slug>' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T1: expected diagnose/<slug>"

n=$(grep -cF 'git rev-parse --path-format=absolute --git-common-dir' diagnose/docs/method.md || true)
[ "$n" -eq 1 ] || fail "T2: expected exactly one absolute git-common-dir, got $n"

n=$(grep -cE 'git rev-parse( --path-format=absolute)? --git-common-dir' diagnose/docs/method.md || true)
[ "$n" -eq 1 ] || fail "T2b: --git-common-dir must never be read relative, got $n reads"

n=$(grep -c 'worktree remove --force' diagnose/docs/method.md || true)
[ "$n" -eq 1 ] || fail "T3: expected exactly one worktree remove --force, got $n"

n=$(grep -cE '^[^#]*>>? *\.gitignore' diagnose/docs/method.md || true)
[ "$n" -eq 0 ] || fail "T4: must not write .gitignore"

n=$(grep -cF '.diagnose/<slug>' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T5: expected .diagnose/<slug>"

n=$(grep -cF 'branch -D <the branch name that succeeded>' diagnose/docs/method.md || true)
[ "$n" -eq 1 ] || fail "T6: expected exactly one branch -D naming the branch that succeeded, got $n"

rm_line=$(grep -n 'worktree remove --force' diagnose/docs/method.md | head -1 | cut -d: -f1)
bd_line=$(grep -nF 'branch -D <the branch name that succeeded>' diagnose/docs/method.md | head -1 | cut -d: -f1)
[ -n "$rm_line" ] && [ -n "$bd_line" ] && [ "$rm_line" -lt "$bd_line" ] \
  || fail "T7: worktree remove must precede branch -D (remove=$rm_line delete=$bd_line)"

range=$(awk '/^## Phase 0/,/^## Redact/' diagnose/docs/method.md)

n=$(printf '%s\n' "$range" | grep -ci 'early-stop' || true)
[ "$n" -ge 1 ] || fail "T8: expected early-stop in Phase 0 teardown"

early_stop=$(printf '%s\n' "$range" | grep -F '**Early-stop.**' | head -1 || true)
[ -n "$early_stop" ] || fail "T9: expected an **Early-stop.** clause in Phase 0 teardown"

n=$(printf '%s\n' "$early_stop" | grep -ci 'without a commit' || true)
[ "$n" -ge 1 ] || fail "T9: early-stop must cover any run that ends without a commit"

n=$(printf '%s\n' "$early_stop" | grep -ciE 'phase 1|red-capable' || true)
[ "$n" -eq 0 ] || fail "T9b: early-stop must not be narrowed back to the Phase 1 red-capable case"

n=$(grep -i 'claim no branch' diagnose/docs/method.md | grep -ci 'delete the branch' || true)
[ "$n" -ge 1 ] || fail "T10: claim no branch and delete the branch must share a sentence"

# A variable set in one Bash call is empty in the next: `cd "" && …` silently
# succeeds in the user's real checkout. Paths may live in the single Phase 0
# command that assigns them, and nowhere else.

prose=$(awk '/^```/ { inb = !inb; next } !inb' diagnose/docs/method.md)
n=$(printf '%s\n' "$prose" | grep -cE '[$](REPO|WORK|BRANCH)' || true)
[ "$n" -eq 0 ] || fail "T11: prose must name paths literally, found $n variable references"

blocks=$(awk '
  /^```/ { if (inb) { if (has) print b; inb = 0 } else { inb = 1; b++; has = 0 } ; next }
  inb && /[$](REPO|WORK|BRANCH)/ { has = 1 }
' diagnose/docs/method.md)
[ "$blocks" = "1" ] || fail "T12: only the first fenced block may use path variables, got blocks [$blocks]"

n=$(grep -ci 'fresh shell' diagnose/docs/method.md || true)
[ "$n" -ge 1 ] || fail "T13: expected the rule that each command starts a fresh shell"

n=$(grep -i 'fresh shell' diagnose/docs/method.md | grep -ci 'literally' || true)
[ "$n" -ge 1 ] || fail "T13b: the fresh-shell rule must require writing the paths literally"

n=$(printf '%s\n' "$early_stop" | grep -cF 'worktree add' || true)
[ "$n" -ge 1 ] || fail "T14: early-stop must condition teardown on worktree add having succeeded"

# The worktree must not be a second checkout inside the repository: git ignores
# it via info/exclude, but test runners, linters and watchers walking the tree
# do not.
add_line=$(grep -F 'worktree add -b diagnose/<slug>' diagnose/docs/method.md | head -1)
[ -n "$add_line" ] || fail "T15: expected the worktree add line"
n=$(printf '%s\n' "$add_line" | grep -cF '$REPO/' || true)
[ "$n" -eq 0 ] || fail "T15: worktree must not be created under the repository"
n=$(grep -cF 'WORK="${TMPDIR:-/tmp}/diagnose-' diagnose/docs/method.md || true)
[ "$n" -eq 1 ] || fail "T15b: worktree path must resolve under TMPDIR, got $n"

echo "ok - method-worktree.test.sh"
