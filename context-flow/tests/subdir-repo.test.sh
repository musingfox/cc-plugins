#!/usr/bin/env bash
# Contract paths are repo-root relative, so --repo naming a subdirectory of the
# repository must give the answer --repo naming its top level gives.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/repo.sh"

SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

# scope: the only commit in base..head changes only the top-level version line of
# p/.claude-plugin/plugin.json; sub/ is a directory of the repository
new_repo
mkdir -p "$REPO/p/.claude-plugin" "$REPO/sub"
echo keep >"$REPO/sub/keep.txt"
printf '{\n  "name": "p",\n  "version": "1.0.0"\n}\n' >"$REPO/p/.claude-plugin/plugin.json"
commit_all base
BASE="$(head_sha)"
printf '{\n  "name": "p",\n  "version": "1.0.1"\n}\n' >"$REPO/p/.claude-plugin/plugin.json"
commit_all bump
write_contracts '[{"name":"C1","touches_files":[]}]'
for dir in "$REPO" "$REPO/sub"; do
  label="S1 --repo ${dir#"$REPO"}"
  out="$(bash "$SCRIPTS/cf-scope.sh" --repo "$dir" --base "$BASE" --head HEAD --contracts "$CONTRACTS" 2>&1)"
  rc=$?
  assert_eq "ALLOWLISTED p/.claude-plugin/plugin.json" "$out" "$label: stdout"
  assert_eq "0" "$rc" "$label: exit"
done
drop_repo

# revert gate: one commit adds src/a.sh and tests/a.sh; the suite needs src/a.sh
new_repo
mkdir -p "$REPO/sub"
echo keep >"$REPO/sub/keep.txt"
commit_all base
BASE="$(head_sha)"
mkdir -p "$REPO/src" "$REPO/tests"
echo 'echo a' >"$REPO/src/a.sh"
echo '[ "$(bash src/a.sh)" = a ]' >"$REPO/tests/a.sh"
commit_all work
write_contracts '[{"name":"C1","touches_files":["src/a.sh","tests/a.sh"],"test_files":["tests/a.sh"]}]'
for dir in "$REPO" "$REPO/sub"; do
  label="S2 revert --repo ${dir#"$REPO"}"
  before="$(git -C "$REPO" worktree list)"
  out="$(bash "$SCRIPTS/cf-revert-gate.sh" --repo "$dir" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" \
    -- bash -c '[ -f src/a.sh ] || exit 1' 2>&1)"
  rc=$?
  assert_eq "CLEAN 1" "$(printf '%s\n' "$out" | tail -1)" "$label: verdict"
  assert_eq "0" "$rc" "$label: exit"
  assert_eq "$before" "$(git -C "$REPO" worktree list)" "$label: worktree list as before"
done
drop_repo
