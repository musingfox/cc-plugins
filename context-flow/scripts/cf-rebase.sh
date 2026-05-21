#!/usr/bin/env bash
# Rebase $CF_BRANCH onto the latest $BASE_BRANCH after Phase 4 PASS.
# Does NOT fast-forward $BASE_BRANCH — the user decides when to ff.
#
# Usage:   cf-rebase.sh SESSION
# Stdout:  one-line status:
#   OK <new-head-sha>            — rebase clean (or no-op)
#   NOOP                         — $BASE_BRANCH unchanged, nothing to rebase
#   SKIP <reason>                — non-git mode, missing base, etc.
#   CONFLICT <files>             — rebase had conflicts; aborted to keep state clean
#
# Side effects:
#   - performs `git rebase` inside $WORK
#   - on conflict: `git rebase --abort` (branch state restored)
#   - never touches $BASE_BRANCH

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
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
MERGE_BASE="$(git -C "$WORK" merge-base "$CF_HEAD" "$CURRENT_BASE_HEAD" 2>/dev/null || true)"
if [ "$MERGE_BASE" = "$CURRENT_BASE_HEAD" ]; then
  echo "NOOP"
  exit 0
fi

# Attempt rebase inside the worktree.
if git -C "$WORK" rebase "$CURRENT_BASE_HEAD" >/dev/null 2>&1; then
  NEW_HEAD="$(git -C "$WORK" rev-parse HEAD)"
  echo "OK $NEW_HEAD"
  exit 0
fi

# Conflict path — collect the conflicting files, then abort to leave a clean state.
CONFLICTS="$(git -C "$WORK" diff --name-only --diff-filter=U 2>/dev/null | paste -sd, - || true)"
git -C "$WORK" rebase --abort >/dev/null 2>&1 || true
echo "CONFLICT ${CONFLICTS:-unknown}"
