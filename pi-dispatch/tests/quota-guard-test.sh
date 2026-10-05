#!/usr/bin/env bash
# quota-guard-test.sh — the QUOTA rollback in SKILL.md touches only a worktree
# pi-worktree.sh create made. A user's own linked worktree, used as PI_CWD,
# keeps its untracked work.
#
# Runs the SKILL.md block itself against real git in mktemp repos.
# Convention: ok/bad lines; final "pass: N, fail: 0"; exit nonzero iff any fail.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$SCRIPT_DIR/../skills/pi-dispatch/SKILL.md"
CREATE="$SCRIPT_DIR/../scripts/pi-worktree.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# The fenced bash block of step 2 ("Roll back each aborted worker").
GUARD="$(awk '/Roll back each aborted worker/{f=1} f&&/```bash/{b=1;next} b&&/```/{exit} b' "$SKILL")"
[ -n "$GUARD" ] && ok "guard block found" || bad "guard block found"

REPO="$TMP/repo"
git init -q -b main "$REPO"
git -C "$REPO" config user.email t@t; git -C "$REPO" config user.name t
git -C "$REPO" config core.hooksPath /dev/null
echo base >"$REPO/a.txt"; git -C "$REPO" add -A; git -C "$REPO" commit -qm base
BASE_REF="$(git -C "$REPO" rev-parse HEAD)"

run_guard() { (WT="$1" BASE_REF="$BASE_REF"; eval "$GUARD") 2>&1; }

# A: the user's own linked worktree, made with plain git.
git -C "$REPO" worktree add -q -b user-wt "$TMP/user-wt" "$BASE_REF"
echo mine >"$TMP/user-wt/untracked.txt"
out="$(run_guard "$TMP/user-wt")"
[ -f "$TMP/user-wt/untracked.txt" ] && ok "A user's linked worktree keeps its untracked file" \
  || bad "A user's linked worktree keeps its untracked file ($out)"
case "$out" in *"left untouched"*) ok "A reports QUOTA and leaves it" ;; *) bad "A reports QUOTA and leaves it ($out)" ;; esac

# B: a worktree pi-worktree.sh create made.
(cd "$REPO" && bash "$CREATE" create --repo_root "$REPO" --branch_name pi-wt --base_ref "$BASE_REF" \
  --base_branch main --work_path "$TMP/pi-wt" --diff_out "$TMP/pi.diff" \
  --cleanup_out "$TMP/cleanup.sh" --rundir-file "$TMP/rundir") >/dev/null 2>&1
echo half >"$TMP/pi-wt/untracked.txt"
run_guard "$TMP/pi-wt" >/dev/null
[ ! -e "$TMP/pi-wt/untracked.txt" ] && ok "B create's worktree is rolled back" || bad "B create's worktree is rolled back"

echo "pass: $PASS, fail: $FAIL"
[ "$FAIL" -eq 0 ]
