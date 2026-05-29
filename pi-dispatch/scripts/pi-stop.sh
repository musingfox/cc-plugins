#!/usr/bin/env bash
# pi-stop.sh — CANCEL a background Pi run started by pi-dispatch.sh.
#
# Reads the real pi pid from the run's pid file, then takes down pi AND its child
# process tree: SIGTERM first (graceful), a short pause, then SIGKILL (force).
# Children are reaped via `pkill -P` so a pi that spawned tool subprocesses leaves
# no orphans.
#
# Usage:
#   pi-stop.sh HANDLE
#     HANDLE — either the RUNDIR (from pi-dispatch.sh) or the OUTPUT result path.
#
# Idempotent: every kill is `2>/dev/null` and the script ends in `exit 0`, so a
# re-run once pi is already gone is a silent no-op.

set -uo pipefail

HANDLE="${1:?usage: pi-stop.sh HANDLE (RUNDIR or OUTPUT path)}"

if [ -d "$HANDLE" ]; then
  RUNDIR="$HANDLE"
else
  RUNDIR="$(dirname "$HANDLE")"
fi
PID_FILE="$RUNDIR/pi.pid"

PI_PID="$(cat "$PID_FILE" 2>/dev/null || true)"

if [ -n "${PI_PID:-}" ]; then
  # Graceful: signal the children first, then pi itself.
  pkill -TERM -P "$PI_PID" 2>/dev/null || true
  kill -TERM "$PI_PID" 2>/dev/null || true
  sleep 2
  # Force: anything still standing (children + pi) gets SIGKILL.
  pkill -P "$PI_PID" 2>/dev/null || true
  kill -9 "$PI_PID" 2>/dev/null || true
  kill -KILL "$PI_PID" 2>/dev/null || true
fi

echo "stop_done pid=${PI_PID:-none}"
exit 0
