#!/usr/bin/env bash
# Library: sourced by other cf-pi scripts. Not directly executable.
#
# load_cf_pi_env SESSION
#   Sources $SESSION/env.sh (session-wide vars) and derives session-scoped paths.
#   Works for both flat (legacy single-worker) and shard (sub-session under flow/shards/<id>)
#   layouts -- it only knows about the session passed in. Per-shard layout is
#   established by cf-pi-shard.sh which seeds each shard dir with its own env.sh.
#   Creates $PI_SESSION_DIR if missing.
#
#   After return, in scope:
#     Session-wide (from $session/env.sh):
#       SESSION, SESSION_BASENAME, PLUGIN_ROOT, SCRIPTS,
#       PI_PROTOCOL, CLEANUP_SCRIPT, PI_DISPATCH_CMD, PI_DESC,
#       PI_STALL_THRESHOLD_S, PI_WALL_CLOCK_S, PI_AVAILABLE,
#       REPO_ROOT, BASE_BRANCH, BASE_HEAD (after cf-pi-worktree.sh has run).
#     Session-scoped paths (all directly under $session/):
#       BRIEF_FILE, REPORT_FILE, ESCALATE_FILE, OUTCOME_FILE,
#       PI_STDOUT, PI_STDERR, PI_SESSION_DIR, PI_PROBE_DIR,
#       DIFF_FILE, WORK, CF_BRANCH,
#       PI_PID_FILE, PI_START_FILE,
#       TEST_LOG.
#     (Probe artifacts live in $PI_PROBE_DIR/probe-{stdout,stderr}.log,
#      written by the canonical pi-probe.sh.)
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
  # Exported, not just set. A plan-resolved test runner is a string the gates
  # hand to a child shell, so a runner like `npm test --prefix $REPO_ROOT`
  # expands against the child's environment; a sourced-but-unexported variable
  # is invisible there and the runner silently loses the argument.
  set -a
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
  CF_BRANCH="cf/${CF_SLUG:-$SESSION_BASENAME}"
  PI_PID_FILE="$session/pi.pid"
  PI_START_FILE="$session/pi-start.ts"
  TEST_LOG="$session/test-output.log"
  set +a

  mkdir -p "$PI_SESSION_DIR"

  return 0
}

load_cf_flow_env() {
  local flow_session="$1"
  if [ -z "$flow_session" ] || [ ! -d "$flow_session" ]; then
    echo "load_cf_flow_env: missing or invalid flow session ($flow_session)" >&2
    return 1
  fi
  set -a
  FLOW_SESSION="$flow_session"
  SHARDS_DIR="$flow_session/shards"
  CONTRACTS_FILE="$flow_session/contracts.json"
  SHARDS_FILE="$flow_session/shards.json"
  DISPATCH_STATE_FILE="$flow_session/dispatch-state.json"
  DISPATCH_ARCHIVE_FILE="$flow_session/dispatch-state-archive.jsonl"
  INTEGRATION_RESULT="$flow_session/integration-result.json"
  PLAN_ATTACHMENTS_DIR="$flow_session/plan-attachments"
  set +a
  return 0
}

# resolve_canon_spec
#   Echoes the absolute path to the canonical spec.sh (highest version), or
#   nothing if the spec plugin is not installed. Always returns 0 -- architecture
#   specs are optional context, never a reason to fail a brief. Mirror of
#   resolve_canon_dispatch below.
resolve_canon_spec() {
  local root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  ls "$root"/../spec/scripts/spec.sh \
     "$root"/../spec/*/scripts/spec.sh \
     "$root"/../../spec/scripts/spec.sh \
     "$root"/../../spec/*/scripts/spec.sh 2>/dev/null \
   | sort -V | tail -1 || true
}

# resolve_canon_dispatch
#   Echoes the absolute path to the canonical pi-dispatch.sh (highest version), or
#   nothing if unresolved. Always returns 0 -- each caller keeps its own distinct
#   failure branch (dispatch: fail-hard; poll: NO_PID fail-soft; stop: /nonexistent
#   fallback). Mirror of spiral/scripts/pi-build.sh's resolver.
resolve_canon_dispatch() {
  local root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
  ls "$root"/../pi-dispatch/scripts/pi-dispatch.sh \
     "$root"/../pi-dispatch/*/scripts/pi-dispatch.sh \
     "$root"/../../pi-dispatch/scripts/pi-dispatch.sh \
     "$root"/../../pi-dispatch/*/scripts/pi-dispatch.sh 2>/dev/null \
   | sort -V | tail -1 || true
}

# test_counts_of LOG
#   Echoes the runner's own summary line(s) from LOG, or "unparsed".
#
#   Quoted, never recomputed: whichever shape the runner prints ("24 passed, 0
#   failed", "10 passing" + "2 pending", "tests: 24, failed: 0") is reported as
#   written, because a per-runner parser is wrong for the next runner. The LAST
#   few matching lines win — runners print per-file lines before the summary.
#
#   Both gates use this. An exit code cannot tell a green suite from one that
#   skipped everything and exited 0, and that blindness matters most at the
#   integration gate, whose green authorizes delivery.
test_counts_of() {
  local log="$1" counts
  counts="$(grep -iE '[0-9]+ (passed|passing|failed|failing|skipped|pending|todo|ignored)|(tests|failures|passed|failed|skipped)[:=] ?[0-9]+' \
    "$log" 2>/dev/null | tail -3 | paste -sd'|' - | tr -s ' ' | cut -c1-240 || true)"
  printf '%s' "${counts:-unparsed}"
}

# run_bounded DEADLINE_S CMD [ARGS...]
#   Runs CMD in its own session + process group with /dev/null on stdin, and
#   group-kills the whole tree if it outruns DEADLINE_S. Returns the command's
#   exit code, or 124 on the deadline (timeout(1)'s convention; macOS ships no
#   timeout(1), hence perl).
#
#   124 alone does not identify a deadline kill: `timeout 600 npm test` is an
#   ordinary thing to write as a test runner, and its own timeout exits 124 too.
#   Routing that as infrastructure would skip the retest and the re-brief a red
#   suite is owed. So the deadline is reported out of band: set
#   CF_BOUNDED_STALL_MARK to a path and the supervisor creates that file if, and
#   only if, it killed the tree itself.
#
#   Every gate that runs project-supplied commands goes through this. A suite
#   that stops to read stdin, or one that spins, otherwise hangs its caller with
#   nothing downstream to bound it.
#
#   The supervisor leaves the caller's process group before forking. The child
#   has its own session, so killing the caller's group would otherwise take the
#   supervisor down and leave the suite running with nothing left to enforce the
#   deadline. Detached, it still kills the tree at the deadline and exits.
run_bounded() {
  local deadline="$1"; shift
  local mark="${CF_BOUNDED_STALL_MARK:-}"
  [ -n "$mark" ] && rm -f "$mark"
  CF_BOUNDED_STALL_MARK="$mark" perl -MPOSIX -e '
    POSIX::setpgid(0, 0);
    my $mark = $ENV{CF_BOUNDED_STALL_MARK};
    my $deadline = shift @ARGV;
    my $pid = fork();
    exit 127 unless defined $pid;
    if ($pid == 0) { POSIX::setsid(); exec { $ARGV[0] } @ARGV; exit 127; }
    my $waited = 0;
    while (1) {
      last if waitpid($pid, POSIX::WNOHANG()) == $pid;
      if ($waited >= $deadline) {
        kill("TERM", -$pid); sleep 2; kill("KILL", -$pid);
        waitpid($pid, 0);
        if ($mark) { open(my $m, ">", $mark) and print $m "$deadline\n"; }
        exit 124;
      }
      select(undef, undef, undef, 0.2);
      $waited += 0.2;
    }
    my $st = $?;
    exit($st & 127 ? 128 + ($st & 127) : $st >> 8);
  ' "$deadline" "$@" < /dev/null
}
