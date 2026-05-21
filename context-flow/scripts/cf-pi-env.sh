#!/usr/bin/env bash
# Library: sourced by other cf-pi scripts. Not directly executable.
#
# load_cf_pi_env SESSION
#   Sources $SESSION/env.sh (session-wide vars) and derives flat session paths.
#   Creates $PI_SESSION_DIR if missing.
#
#   After return, in scope:
#     Session-wide: SESSION, SESSION_BASENAME, PLUGIN_ROOT, SCRIPTS,
#       PI_PROTOCOL, CLEANUP_SCRIPT, PI_PROVIDER, PI_MODEL, PI_DESC,
#       PI_STALL_THRESHOLD_S, PI_WALL_CLOCK_S, PI_AVAILABLE,
#       REPO_ROOT, BASE_BRANCH, BASE_HEAD (after cf-pi-worktree.sh has run).
#     Flat paths (all directly under $SESSION/):
#       BRIEF_FILE, REPORT_FILE,
#       PI_STDOUT, PI_STDERR, PI_SESSION_DIR, PI_PROBE_DIR,
#       DIFF_FILE, WORK, CF_BRANCH,
#       PI_PID_FILE, PI_START_FILE,
#       PROBE_STDOUT, PROBE_STDERR, TEST_LOG.
#     PI_ARGS array rebuilt from PI_PROVIDER/PI_MODEL (empty when neither set).

load_cf_pi_env() {
  local session="$1"
  if [ -z "$session" ] || [ ! -f "$session/env.sh" ]; then
    echo "load_cf_pi_env: missing or invalid session ($session)" >&2
    return 1
  fi
  # shellcheck disable=SC1090,SC1091
  . "$session/env.sh"

  BRIEF_FILE="$session/implement-brief.md"
  REPORT_FILE="$session/implement-report.md"
  PI_STDOUT="$session/pi-stdout.log"
  PI_STDERR="$session/pi-stderr.log"
  PI_SESSION_DIR="$session/pi-sessions"
  PI_PROBE_DIR="$session/pi-probe"
  DIFF_FILE="$session/implement.diff"
  WORK="$session/work"
  CF_BRANCH="ctxflow/$SESSION_BASENAME"
  PI_PID_FILE="$session/pi.pid"
  PI_START_FILE="$session/pi-start.ts"
  PROBE_STDOUT="$session/probe-stdout.log"
  PROBE_STDERR="$session/probe-stderr.log"
  TEST_LOG="$session/test-output.log"

  mkdir -p "$PI_SESSION_DIR"

  PI_ARGS=()
  [ -n "${PI_PROVIDER:-}" ] && PI_ARGS+=(--provider "$PI_PROVIDER")
  [ -n "${PI_MODEL:-}" ] && PI_ARGS+=(--model "$PI_MODEL")
  # Final `return 0` matters: without it, the last `&& append` short-circuits
  # when PI_MODEL is empty (default), function returns 1, and any caller
  # running `set -e` exits silently before its own work begins.
  return 0
}
