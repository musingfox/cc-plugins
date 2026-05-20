#!/usr/bin/env bash
# Set up isolated WORK area for Pi.
# - In a git repo: creates a worktree at $WORK on a fresh branch ($PI_BRANCH).
# - Otherwise:     creates a plain scratch directory at $WORK.
#
# Usage:   cf-pi-worktree.sh SESSION
# Stdout:  WORK path
# Appends REPO_ROOT to $SESSION/env.sh on first invocation (session-wide).
# Appends cleanup commands to $CLEANUP_SCRIPT (worktree removal +
# branch delete + diff capture).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
load_cf_pi_env "$session"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -n "$REPO_ROOT" ]; then
  git -C "$REPO_ROOT" worktree add -B "$PI_BRANCH" "$WORK" HEAD >&2
  cat >> "$CLEANUP_SCRIPT" <<EOF
git -C "$WORK" add --intent-to-add -- . 2>/dev/null || true
git -C "$WORK" diff HEAD > "$DIFF_FILE" 2>/dev/null || true
git -C "$REPO_ROOT" worktree remove --force "$WORK" 2>/dev/null || true
git -C "$REPO_ROOT" branch -D "$PI_BRANCH" 2>/dev/null || true
EOF
else
  mkdir -p "$WORK"
  echo "# scratch mode ($SESSION_BASENAME) -- no cleanup, $WORK retained for inspection" >> "$CLEANUP_SCRIPT"
fi

# REPO_ROOT is session-wide; append once.
if ! grep -q '^REPO_ROOT=' "$session/env.sh" 2>/dev/null; then
  echo "REPO_ROOT=\"$REPO_ROOT\"" >> "$session/env.sh"
fi

echo "$WORK"
