#!/usr/bin/env bash
# pi-poll.sh — STATELESS one-shot poll of a background Pi run started by pi-dispatch.sh.
#
# Reads run state from disk and emits exactly one status line, then exits 0. Call
# it once per round from the dispatcher's poll loop (short Bash invocations). A
# failed/early poll != Pi failure — just poll again.
#
# Usage:
#   pi-poll.sh HANDLE
#     HANDLE — either the RUNDIR (from pi-dispatch.sh) or the OUTPUT result path.
#              Every artifact path is derived deterministically from it; no globbing.
#
# Stdout — exactly one of:
#   STATUS=OK   OUTPUT=<path>   Pi exited; result present, no pi-side error; terminal.
#   STATUS=FAIL OUTPUT=<path>   Pi exited bad / pi-side error / handle broke; terminal.
#   RUNNING                     Pi still alive (or settling within grace); KEEP POLLING.
#
# Decision order is PROCESS-STATE-FIRST: once the process has exited we judge the
# RESULT (OK/FAIL) before ever considering wall-clock TIMEOUT or stall STALL — a
# Pi that already finished is terminal regardless of elapsed time. Only while the
# process is still ALIVE do the liveness guards (wall-clock, stall) apply.
#
# Three-state terminal sub-classes surfaced in the diagnostic tail:
#   (exited bad)        STATUS=FAIL
#   wall-clock exceeded TIMEOUT  -> STATUS=FAIL
#   no fresh output     STALL    -> STATUS=FAIL
#   pi-side error       ERROR    -> STATUS=FAIL
#
# There is NO done-marker. OK vs FAIL after exit comes from: result file non-empty
# AND no "errorMessage" in the session log / stderr. The dead-but-no-result case
# (pi killed mid-run) is bounded by a no-marker grace so it cannot loop RUNNING
# forever — past the grace it becomes terminal STATUS=FAIL.
#
# Tunables (numeric, env-overridable):
#   PI_WALL_CLOCK_S        hard elapsed ceiling while alive   (default 900)
#   PI_STALL_THRESHOLD_S   max seconds with no output update  (default 300)
#   PI_NO_MARKER_GRACE_S   grace for dead-but-empty result    (default 30)

set -uo pipefail

HANDLE="${1:?usage: pi-poll.sh HANDLE (RUNDIR or OUTPUT path)}"

WALL_CLOCK="${PI_WALL_CLOCK_S:-900}"
STALL_THRESHOLD="${PI_STALL_THRESHOLD_S:-300}"
NO_MARKER_GRACE="${PI_NO_MARKER_GRACE_S:-30}"

# Derive the run dir from the handle (accept either the dir or the result file).
if [ -d "$HANDLE" ]; then
  RUNDIR="$HANDLE"
else
  RUNDIR="$(dirname "$HANDLE")"
fi

OUTPUT_FILE="$RUNDIR/result.md"
PID_FILE="$RUNDIR/pi.pid"
START_FILE="$RUNDIR/pi-start.ts"
STDERR_FILE="$RUNDIR/pi.stderr.log"
SESSION_DIR="$RUNDIR/sessions"

# Broken handle — nothing to poll. Terminal FAIL so the caller doesn't loop forever.
if [ ! -f "$PID_FILE" ]; then
  echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE handle=broken"
  exit 0
fi

PI_PID="$(cat "$PID_FILE" 2>/dev/null)"
[ -z "$PI_PID" ] && { echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE no-pid"; exit 0; }

# Elapsed wall-clock since dispatch wrote the start file.
START="$(cat "$START_FILE" 2>/dev/null)"
[ -z "$START" ] && START=$(date +%s)
NOW=$(date +%s)
ELAPSED=$((NOW - START))

# Genuine liveness probe. rc=$? is the kill -0 result, NOT pi's exit code.
kill -0 "$PI_PID" 2>/dev/null
rc=$?

# Result size + a pi-side error scan (session log + stderr) shared by both branches.
SZ=$(wc -c < "$OUTPUT_FILE" 2>/dev/null || echo 0)
SESSION_JSONL=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -1)
PI_ERROR=0
if [ -n "$SESSION_JSONL" ] && grep -q 'errorMessage' "$SESSION_JSONL" 2>/dev/null; then PI_ERROR=1; fi
if grep -q 'errorMessage' "$STDERR_FILE" 2>/dev/null; then PI_ERROR=1; fi

# ---- PROCESS-STATE-FIRST: the process has EXITED -> judge the result, terminal ----
if [ "$rc" -ne 0 ]; then
  # pi-side error wins: even a non-empty result is a failure if the log errored.
  if [ "$PI_ERROR" -eq 1 ]; then
    echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE ERROR ${ELAPSED}s"
    exit 0
  fi
  # Clean exit with real output -> success.
  if [ "$SZ" -gt 0 ]; then
    echo "STATUS=OK OUTPUT=$OUTPUT_FILE ${ELAPSED}s ${SZ}B"
    exit 0
  fi
  # Dead with NO result and no error marker = killed mid-run. Bound it with the
  # no-marker grace so we never loop RUNNING forever (the permanent-RUNNING fix).
  # ELAPSED grows monotonically (start-ts is fixed on disk), so it always crosses
  # the grace on a later poll -> terminal FAIL.
  if [ "$ELAPSED" -gt "$NO_MARKER_GRACE" ]; then
    echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE no-result ${ELAPSED}s grace=${NO_MARKER_GRACE}s"
    exit 0
  fi
  echo "RUNNING settling ${ELAPSED}s (dead, awaiting result within grace=${NO_MARKER_GRACE}s)"
  exit 0
fi

# ---- ALIVE: liveness guards (wall-clock TIMEOUT, stall STALL, pi-side ERROR) ----
if [ "$PI_ERROR" -eq 1 ]; then
  echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE ERROR ${ELAPSED}s"
  exit 0
fi
if [ "$ELAPSED" -gt "$WALL_CLOCK" ]; then
  echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE TIMEOUT ${ELAPSED}s wall=${WALL_CLOCK}s"
  exit 0
fi
# Stall: portable mtime of whichever artifact moved most recently.
NEWEST="$OUTPUT_FILE"
[ -n "$SESSION_JSONL" ] && NEWEST="$SESSION_JSONL"
MTIME=$(stat -f %m "$NEWEST" 2>/dev/null || stat -c %Y "$NEWEST" 2>/dev/null || echo "$NOW")
STALE=$((NOW - MTIME))
if [ "$STALE" -gt "$STALL_THRESHOLD" ]; then
  echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE STALL ${ELAPSED}s stale=${STALE}s thr=${STALL_THRESHOLD}s"
  exit 0
fi

echo "RUNNING ${ELAPSED}s ${SZ}B stale=${STALE}s"
exit 0
