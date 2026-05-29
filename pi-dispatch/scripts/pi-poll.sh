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
#   RUNNING                              Pi still alive, no done-marker; KEEP POLLING (non-terminal, no STATUS=)
#   STATUS=OK   OUTPUT=<result path>     Pi exited 0;  terminal
#   STATUS=FAIL OUTPUT=<result path>     Pi exited non-zero / handle broken; terminal
#
# The caller stops polling only when a `STATUS=` line appears.
#
# Exit-code contract: pi's real code is captured in pi-dispatch.sh (where pi runs)
# and persisted to the done-marker. Here we capture a genuine liveness rc=$? and
# read the persisted code to choose OK vs FAIL — never `set -e` silent-exit.

set -uo pipefail

HANDLE="${1:?usage: pi-poll.sh HANDLE (RUNDIR or OUTPUT path)}"

# Derive the run dir from the handle (accept either the dir or the result file).
if [ -d "$HANDLE" ]; then
  RUNDIR="$HANDLE"
else
  RUNDIR="$(dirname "$HANDLE")"
fi

OUTPUT_FILE="$RUNDIR/result.md"
PID_FILE="$RUNDIR/pi.pid"
DONE_FILE="$RUNDIR/done"

# Broken handle — nothing to poll. Terminal FAIL so the caller doesn't loop forever.
if [ ! -f "$PID_FILE" ]; then
  echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE"
  exit 0
fi

PI_PID="$(cat "$PID_FILE" 2>/dev/null)"

# Genuine liveness probe. rc=$? is the kill -0 result, NOT pi's exit code.
kill -0 "$PI_PID" 2>/dev/null
rc=$?

# Still alive and no done-marker yet -> non-terminal; tell the caller to keep polling.
if [ "$rc" -eq 0 ] && [ ! -f "$DONE_FILE" ]; then
  echo "RUNNING"
  exit 0
fi

# Process gone but done-marker not flushed yet -> brief race; treat as still settling.
if [ ! -f "$DONE_FILE" ]; then
  echo "RUNNING"
  exit 0
fi

# Done-marker present: read pi's REAL persisted exit code and branch.
code="$(cat "$DONE_FILE" 2>/dev/null)"
if [ "$code" = "0" ]; then
  echo "STATUS=OK OUTPUT=$OUTPUT_FILE"
else
  echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE"
fi
exit 0
