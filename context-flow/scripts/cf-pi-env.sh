#!/usr/bin/env bash
# Library: sourced by other cf-pi scripts. Not directly executable.
#
# load_cf_pi_env SESSION
#   Sources $SESSION/env.sh (session-wide vars) and derives session-scoped paths.
#   Works for both flat (legacy single-Pi) and shard (sub-session under flow/shards/<id>)
#   layouts -- it only knows about the session passed in. Per-shard layout is
#   established by cf-pi-shard.sh which seeds each shard dir with its own env.sh.
#   Creates $PI_SESSION_DIR if missing.
#
#   After return, in scope:
#     Session-wide (from $session/env.sh):
#       SESSION, SESSION_BASENAME, PLUGIN_ROOT, SCRIPTS,
#       PI_PROTOCOL, CLEANUP_SCRIPT, PI_PROVIDER, PI_MODEL, PI_DESC,
#       PI_STALL_THRESHOLD_S, PI_WALL_CLOCK_S, PI_AVAILABLE,
#       REPO_ROOT, BASE_BRANCH, BASE_HEAD (after cf-pi-worktree.sh has run).
#     Session-scoped paths (all directly under $session/):
#       BRIEF_FILE, REPORT_FILE, ESCALATE_FILE, OUTCOME_FILE,
#       PI_STDOUT, PI_STDERR, PI_SESSION_DIR, PI_PROBE_DIR,
#       DIFF_FILE, WORK, CF_BRANCH,
#       PI_PID_FILE, PI_START_FILE,
#       PROBE_STDOUT, PROBE_STDERR, TEST_LOG.
#     PI_ARGS array rebuilt from PI_PROVIDER/PI_MODEL (empty when neither set).
#
# load_cf_flow_env FLOW_SESSION
#   Derives flow-level (cross-shard) paths from the flow session root.
#   Use this in scripts that operate at the flow level (cf-pi-shard.sh,
#   cf-pi-integrate.sh, cf-pi-merge-revision.sh, cf-pi-rollback.sh,
#   cf-pi-status.sh). Does NOT source env.sh -- callers handle that.
#
#   After return, in scope:
#     FLOW_SESSION, SHARDS_DIR,
#     CONTRACTS_FILE         = $FLOW_SESSION/contracts.json
#     SHARDS_FILE            = $FLOW_SESSION/shards.json
#     DISPATCH_STATE_FILE    = $FLOW_SESSION/dispatch-state.json
#     DISPATCH_ARCHIVE_FILE  = $FLOW_SESSION/dispatch-state-archive.jsonl
#     INTEGRATION_RESULT     = $FLOW_SESSION/integration-result.json
#     PLAN_ATTACHMENTS_DIR   = $FLOW_SESSION/plan-attachments

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
  ESCALATE_FILE="$session/escalate.md"
  OUTCOME_FILE="$session/outcome.md"
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

load_cf_flow_env() {
  local flow_session="$1"
  if [ -z "$flow_session" ] || [ ! -d "$flow_session" ]; then
    echo "load_cf_flow_env: missing or invalid flow session ($flow_session)" >&2
    return 1
  fi
  FLOW_SESSION="$flow_session"
  SHARDS_DIR="$flow_session/shards"
  CONTRACTS_FILE="$flow_session/contracts.json"
  SHARDS_FILE="$flow_session/shards.json"
  DISPATCH_STATE_FILE="$flow_session/dispatch-state.json"
  DISPATCH_ARCHIVE_FILE="$flow_session/dispatch-state-archive.jsonl"
  INTEGRATION_RESULT="$flow_session/integration-result.json"
  PLAN_ATTACHMENTS_DIR="$flow_session/plan-attachments"
  return 0
}
