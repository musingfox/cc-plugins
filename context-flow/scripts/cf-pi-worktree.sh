#!/usr/bin/env bash
# Set up isolated WORK area for Pi.
# - In a git repo: creates a worktree at $SESSION/work on a fresh branch.
# - Otherwise:     creates a plain scratch directory at $SESSION/work.
#
# Usage:   cf-pi-worktree.sh SESSION
# Stdout:  WORK path
# Appends WORK + REPO_ROOT to $SESSION/env.sh so sibling scripts pick them up.
# Appends cleanup commands to $CLEANUP_SCRIPT (worktree removal + branch delete).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
load_cf_pi_env "$session"

WORK="$session/work"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -n "$REPO_ROOT" ]; then
  PI_BRANCH="ctxflow/pi-$SESSION_BASENAME"
  git -C "$REPO_ROOT" worktree add -B "$PI_BRANCH" "$WORK" HEAD >&2
  cat >> "$CLEANUP_SCRIPT" <<EOF
git -C "$WORK" add --intent-to-add -- . 2>/dev/null || true
git -C "$WORK" diff HEAD > "$session/implement.diff" 2>/dev/null || true
git -C "$REPO_ROOT" worktree remove --force "$WORK" 2>/dev/null || true
git -C "$REPO_ROOT" branch -D "$PI_BRANCH" 2>/dev/null || true
EOF
else
  mkdir -p "$WORK"
  echo "# scratch mode -- no cleanup, $WORK retained for inspection" >> "$CLEANUP_SCRIPT"
fi

{
  echo "WORK=\"$WORK\""
  echo "REPO_ROOT=\"$REPO_ROOT\""
} >> "$session/env.sh"

echo "$WORK"
