#!/usr/bin/env bash
# pi-stop.sh — CANCEL a background Pi run started by pi-dispatch.sh.
#
# Reads the run's process-group id (pi.pgid) and GROUP-KILLS the whole tree:
# SIGTERM to the group first (graceful), a short pause, then SIGKILL (force). The
# group was created by the perl POSIX::setsid wrapper, which is the group LEADER,
# so a single group signal reaches pi AND every bash/tool descendant it spawned —
# grandchildren included — with no per-process tree walking.
#
# Usage:
#   pi-stop.sh HANDLE
#     HANDLE — either the RUNDIR (from pi-dispatch.sh) or the OUTPUT result path.
#
# SAFETY: setsid put pi into a BRAND-NEW process group, detached from the caller's
# (the dispatcher / Claude) group. So `kill -- -$PGID` targets ONLY the pi group —
# it can never reach the dispatcher or Claude, which live in a different group.
# The `--` end-of-options and the leading `-` on the id are load-bearing: together
# they mean "signal the process GROUP $PGID", not a single process.
#
# Idempotent: every kill is `2>/dev/null`, a missing pgid file is a silent no-op,
# and the script ends in `exit 0` — re-running once pi is already gone does nothing.

set -uo pipefail

HANDLE="${1:?usage: pi-stop.sh HANDLE (RUNDIR or OUTPUT path)}"

if [ -d "$HANDLE" ]; then
  RUNDIR="$HANDLE"
else
  RUNDIR="$(dirname "$HANDLE")"
fi
PGID_FILE="$RUNDIR/pi.pgid"

PGID="$(cat "$PGID_FILE" 2>/dev/null || true)"

if [ -n "${PGID:-}" ]; then
  # Graceful: SIGTERM the whole group ('-- -PGID' == group semantics).
  kill -TERM -- -"$PGID" 2>/dev/null || true
  sleep 2
  # Force: anything in the group still standing gets SIGKILL.
  kill -KILL -- -"$PGID" 2>/dev/null || true
fi

echo "stop_done pgid=${PGID:-none}"
exit 0
