#!/usr/bin/env bash
# Rebase $CF_BRANCH onto the latest $BASE_BRANCH after Phase 4 PASS.
# Does NOT fast-forward $BASE_BRANCH — the user decides when to ff.
#
# Usage:   cf-rebase.sh SESSION [TEST_RUNNER]
# Stdout:  one-line status:
#   OK <new-head-sha>            — rebase clean, and the delivered tree is green
#   NOOP <head-sha>              — $BASE_BRANCH unchanged, delivered tree green
#   SKIP <reason>                — non-git mode, missing base, etc.
#   CONFLICT <files>             — rebase had conflicts; aborted to keep state clean
#   TESTFAIL <head-sha> <log>    — the tree about to be handed over fails its suite
#   TESTSTALLED <head-sha> <log> — that suite outran its deadline
#
# With TEST_RUNNER given, the FULL suite runs on the tree the human is about to
# fast-forward. Nothing else tests it: the shard gates and the integration gate
# both ran before this rebase, and the advisory-fix route reaches delivery with
# commits no gate has seen. A rebase is not a no-op on content — the same diff
# over a moved base is a different tree — so a green integration is not evidence
# about what actually ships.
#
# Side effects:
#   - performs `git rebase` inside $WORK
#   - on conflict: `git rebase --abort` (branch state restored)
#   - runs TEST_RUNNER inside $WORK, log at $SESSION/rebase-test.log
#   - never touches $BASE_BRANCH
#
# Env: CF_TEST_DEADLINE_S  seconds before the suite is group-killed (default 1800)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
TEST_RUNNER="${2:-}"
load_cf_pi_env "$session"

if [ -z "${REPO_ROOT:-}" ]; then
  echo "SKIP non-git-mode"
  exit 0
fi

if [ -z "${BASE_BRANCH:-}" ]; then
  echo "SKIP detached-base-head"
  exit 0
fi

if [ ! -d "$WORK/.git" ] && [ ! -f "$WORK/.git" ]; then
  echo "SKIP worktree-missing"
  exit 0
fi

CURRENT_BASE_HEAD="$(git -C "$REPO_ROOT" rev-parse "$BASE_BRANCH" 2>/dev/null || true)"
if [ -z "$CURRENT_BASE_HEAD" ]; then
  echo "SKIP base-branch-vanished"
  exit 0
fi

CF_HEAD="$(git -C "$WORK" rev-parse HEAD 2>/dev/null || true)"
if [ -z "$CF_HEAD" ]; then
  echo "SKIP cf-head-missing"
  exit 0
fi

# Already up-to-date: cf branch's merge-base with base equals base HEAD.
# Verify the tree that is about to be handed over. Emits the final status line
# and exits; on a green suite it reports $1 (OK or NOOP) with the head sha.
verify_and_report() {
  local word="$1" head="$2" rc
  if [ -z "$TEST_RUNNER" ]; then
    echo "$word $head"
    exit 0
  fi
  local log="$session/rebase-test.log"
  set +e
  ( cd "$WORK" && run_bounded "${CF_TEST_DEADLINE_S:-1800}" bash -c "$TEST_RUNNER" ) > "$log" 2>&1
  rc=$?
  set -e
  case "$rc" in
    0)   echo "$word $head" ;;
    124) echo "TESTSTALLED $head $log" ;;
    *)   echo "TESTFAIL $head $log" ;;
  esac
  exit 0
}

MERGE_BASE="$(git -C "$WORK" merge-base "$CF_HEAD" "$CURRENT_BASE_HEAD" 2>/dev/null || true)"
if [ "$MERGE_BASE" = "$CURRENT_BASE_HEAD" ]; then
  verify_and_report NOOP "$CF_HEAD"
fi

# Attempt rebase inside the worktree.
if git -C "$WORK" rebase "$CURRENT_BASE_HEAD" >/dev/null 2>&1; then
  NEW_HEAD="$(git -C "$WORK" rev-parse HEAD)"
  verify_and_report OK "$NEW_HEAD"
fi

# Conflict path — collect the conflicting files, then abort to leave a clean state.
CONFLICTS="$(git -C "$WORK" diff --name-only --diff-filter=U 2>/dev/null | paste -sd, - || true)"
git -C "$WORK" rebase --abort >/dev/null 2>&1 || true
echo "CONFLICT ${CONFLICTS:-unknown}"
