#!/usr/bin/env bash
# pi-run.sh — RUN-TO-TERMINAL: dispatch a brief and BLOCK until terminal, in ONE call.
#
# The composition callers kept hand-rolling (spiral's pi-build loop, foreman's
# wait loop, Workflow thin shells): launch via pi-dispatch.sh, poll pi-poll.sh
# until terminal, emit exactly ONE outcome line. Use it from contexts that must
# block inside a single Bash call (sub-agents can't be woken by Monitor).
#
# Usage:
#   pi-run.sh [--profile NAME] [--deadline S] BRIEF [OUTDIR [PRIOR_RUNDIR]]
#     --deadline S  hard wall for THIS call (default: PI_RUN_DEADLINE_S or 480).
#     Everything else is passed through to pi-dispatch.sh unchanged.
#
# Stdout (exactly one line, exit 0 always — the outcome is data, not a code):
#   OUTCOME=OK   OUTPUT=<result.md> RUNDIR=<dir> | <pi-poll terminal line>
#   OUTCOME=FAIL OUTPUT=<result.md> RUNDIR=<dir> | <pi-poll terminal line or deadline/dispatch cause>
#
# ORPHAN SAFETY — the detached watchdog (the reason this script exists):
#   Callers of a blocking call can DIE MID-WAIT (the Bash tool's default 120s
#   timeout, a killed sub-agent, a dropped session). Any cleanup coded after
#   the poll loop dies with them. So immediately after dispatch we spawn a
#   WATCHDOG in its own setsid process group (survives the caller's process
#   tree, harness kills included): it sleeps to the deadline and, if the run
#   is still alive, group-kills it via pi-stop.sh and stamps RUNDIR/watchdog.
#   Normal completion kills the watchdog group on the way out. The guarantee:
#   NO orphan worker outlives deadline+grace, no matter what happens to the
#   caller — safety no longer depends on the caller passing the right timeout.
#
# Env: PI_RUN_DEADLINE_S (default 480), PI_POLL_INTERVAL_S (default 5),
#      everything pi-dispatch.sh/pi-poll.sh honor (PI_BIN, PI_MODEL, profiles…).
#      PI_WALL_CLOCK_S defaults to the deadline so pi-poll's own liveness guard
#      agrees with the watchdog instead of racing past it.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROFILE_ARGS=()
DEADLINE="${PI_RUN_DEADLINE_S:-480}"
while :; do
  case "${1:-}" in
    --profile)  PROFILE_ARGS=(--profile "${2:?--profile needs a NAME}"); shift 2 ;;
    --deadline) DEADLINE="${2:?--deadline needs SECONDS}"; shift 2 ;;
    *) break ;;
  esac
done

BRIEF="${1:?usage: pi-run.sh [--profile NAME] [--deadline S] BRIEF [OUTDIR [PRIOR_RUNDIR]]}"
OUTDIR="${2:-}"
PRIOR="${3:-}"

# Keep pi-poll's own wall-clock guard inside the watchdog's horizon.
export PI_WALL_CLOCK_S="${PI_WALL_CLOCK_S:-$DEADLINE}"
POLL_INTERVAL="${PI_POLL_INTERVAL_S:-5}"

# Dispatch (non-blocking) — positional args only when provided (a resume needs
# an explicit OUTDIR slot, so fill it with pi-dispatch's own default).
ARGS=("$BRIEF")
if [ -n "$PRIOR" ]; then
  ARGS+=("${OUTDIR:-${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/pi-dispatch}" "$PRIOR")
elif [ -n "$OUTDIR" ]; then
  ARGS+=("$OUTDIR")
fi
launch="$("$SCRIPT_DIR/pi-dispatch.sh" ${PROFILE_ARGS[@]+"${PROFILE_ARGS[@]}"} "${ARGS[@]}")" || true
RUNDIR="$(printf '%s\n' "$launch" | sed -n 's/^RUNDIR=//p')"
OUTPUT="$(printf '%s\n' "$launch" | sed -n 's/^OUTPUT=//p')"
if [ -z "$RUNDIR" ]; then
  echo "OUTCOME=FAIL OUTPUT= RUNDIR= | dispatch-failed"
  exit 0
fi

# Detached watchdog: own session+group via perl setsid, so the caller's death
# (harness timeout, killed sub-agent) cannot take it down. It exits silently
# if the run finished first; otherwise it group-kills and stamps the marker.
perl -MPOSIX -e '
  POSIX::setsid();
  my ($deadline, $rundir, $stop) = @ARGV;
  sleep $deadline;
  my $pid = do { open(my $f, "<", "$rundir/pi.pid") or exit 0; local $/; <$f> };
  chomp $pid;
  exit 0 unless $pid && kill(0, $pid);
  system($stop, $rundir);
  open(my $m, ">", "$rundir/watchdog") and print $m "killed at deadline ${deadline}s\n";
' "$DEADLINE" "$RUNDIR" "$SCRIPT_DIR/pi-stop.sh" >/dev/null 2>&1 &
WATCHDOG=$!
disown 2>/dev/null || true

finish() { # emit the single outcome line, kill the watchdog group, exit 0
  kill -TERM -- -"$WATCHDOG" 2>/dev/null || kill -TERM "$WATCHDOG" 2>/dev/null || true
  printf '%s\n' "$1"
  exit 0
}

START=$(date +%s)
while :; do
  line="$("$SCRIPT_DIR/pi-poll.sh" "$RUNDIR")"
  case "$line" in
    STATUS=OK*)   finish "OUTCOME=OK OUTPUT=$OUTPUT RUNDIR=$RUNDIR | $line" ;;
    STATUS=FAIL*) finish "OUTCOME=FAIL OUTPUT=$OUTPUT RUNDIR=$RUNDIR | $line" ;;
  esac
  # Belt-and-suspenders: if poll never turns terminal by the deadline, stop and
  # fail here (the watchdog would catch it anyway if we died instead).
  if [ $(( $(date +%s) - START )) -gt "$DEADLINE" ]; then
    "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
    finish "OUTCOME=FAIL OUTPUT=$OUTPUT RUNDIR=$RUNDIR | deadline ${DEADLINE}s"
  fi
  sleep "$POLL_INTERVAL"
done
