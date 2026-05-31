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
# Success is gated by a SENTINEL: OK after exit requires the trailing line of the
# result to be __PI_DISPATCH_DONE__ (printed by pi itself per the launch prompt)
# AND no quoted-key "errorMessage" in the session log / stderr. A process that
# exited WITHOUT the trailing sentinel (e.g. SIGKILL mid-write) is truncated, not
# success. The dead-but-no-sentinel case is bounded by a no-marker grace so it
# cannot loop RUNNING forever — past the grace it becomes terminal STATUS=FAIL.
#
# On a terminal FAIL detected while pi is still ALIVE (TIMEOUT / STALL / pi-side
# ERROR), this script first calls pi-stop.sh to cancel the orphan pi tree, then
# emits STATUS=FAIL — the cancel is closed in the script layer, not left to the
# agent. The dead branch needs no kill (the process already exited).
#
# Tunables (numeric, env-overridable):
#   PI_WALL_CLOCK_S        hard elapsed ceiling while alive   (default 900)
#   PI_STALL_THRESHOLD_S   max seconds with no output update  (default 300)
#   PI_NO_MARKER_GRACE_S   grace for dead-but-empty result    (default 30)

set -uo pipefail

# Locate our own script dir so we can invoke the sibling pi-stop.sh to cancel an
# orphan pi on a terminal FAIL (closed in the script layer, not via the agent).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Success sentinel: pi prints this as the LAST line of its result when it finishes
# cleanly (see pi-dispatch.sh launch prompt). A trailing-region match gates OK.
SENTINEL='__PI_DISPATCH_DONE__'

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
# The error scan keys on the QUOTED JSON field "errorMessage" so prose that merely
# mentions the word errorMessage in the result/log body is NOT a false ERROR.
SZ=$(wc -c < "$OUTPUT_FILE" 2>/dev/null || echo 0)
SESSION_JSONL=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -1)
PI_ERROR=0
if [ -n "$SESSION_JSONL" ] && grep -q '"errorMessage"' "$SESSION_JSONL" 2>/dev/null; then PI_ERROR=1; fi
if grep -q '"errorMessage"' "$STDERR_FILE" 2>/dev/null; then PI_ERROR=1; fi

# Sentinel-at-tail probe: did pi finish cleanly (trailing sentinel present)? Check
# only the trailing region so the sentinel must be at the END of the result.
SENTINEL_OK=0
if tail -n 5 "$OUTPUT_FILE" 2>/dev/null | grep -qF "$SENTINEL"; then SENTINEL_OK=1; fi

# ---- PROCESS-STATE-FIRST: the process has EXITED -> judge the result, terminal ----
if [ "$rc" -ne 0 ]; then
  # pi-side error wins: even a non-empty result is a failure if the log errored.
  if [ "$PI_ERROR" -eq 1 ]; then
    echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE ERROR ${ELAPSED}s"
    exit 0
  fi
  # Clean exit WITH the trailing sentinel -> success. Result size alone is NOT
  # enough: a SIGKILL mid-write leaves a non-empty but truncated file with no
  # sentinel, which must FAIL — so success is gated on the sentinel, not on size.
  if [ "$SENTINEL_OK" -eq 1 ]; then
    echo "STATUS=OK OUTPUT=$OUTPUT_FILE ${ELAPSED}s ${SZ}B"
    exit 0
  fi
  # Dead with NO trailing sentinel = killed/crashed mid-run (truncated). Bound it
  # with the no-marker grace so we never loop RUNNING forever (the permanent-
  # RUNNING fix). ELAPSED grows monotonically (start-ts is fixed on disk), so it
  # always crosses the grace on a later poll -> terminal FAIL.
  if [ "$ELAPSED" -gt "$NO_MARKER_GRACE" ]; then
    echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE no-sentinel ${ELAPSED}s grace=${NO_MARKER_GRACE}s"
    exit 0
  fi
  echo "RUNNING settling ${ELAPSED}s (dead, awaiting sentinel within grace=${NO_MARKER_GRACE}s)"
  exit 0
fi

# ---- ALIVE: liveness guards (wall-clock TIMEOUT, stall STALL, pi-side ERROR) ----
# On any ALIVE-branch terminal FAIL the pi tree is still running, so we CANCEL it
# (kill via the sibling pi-stop.sh) BEFORE emitting STATUS=FAIL — closing the loop
# in the script layer so no orphan pi is left behind for the agent to chase.
if [ "$PI_ERROR" -eq 1 ]; then
  "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
  echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE ERROR ${ELAPSED}s"
  exit 0
fi
if [ "$ELAPSED" -gt "$WALL_CLOCK" ]; then
  "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
  echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE TIMEOUT ${ELAPSED}s wall=${WALL_CLOCK}s"
  exit 0
fi
# Stall: portable mtime of whichever artifact moved most recently.
NEWEST="$OUTPUT_FILE"
[ -n "$SESSION_JSONL" ] && NEWEST="$SESSION_JSONL"
MTIME=$(stat -f %m "$NEWEST" 2>/dev/null || stat -c %Y "$NEWEST" 2>/dev/null || echo "$NOW")
STALE=$((NOW - MTIME))
if [ "$STALE" -gt "$STALL_THRESHOLD" ]; then
  "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
  echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE STALL ${ELAPSED}s stale=${STALE}s thr=${STALL_THRESHOLD}s"
  exit 0
fi

# Still alive, within all guards, not yet finished — keep polling (non-terminal).
echo "RUNNING ${ELAPSED}s ${SZ}B stale=${STALE}s"
exit 0
