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
#   STATUS=OK   OUTPUT=<path>   Pi exited rc==0; result present, no pi-side error; terminal.
#   STATUS=FAIL OUTPUT=<path>   Pi exited rc!=0 / no-rc (killed) / pi-side error; terminal.
#   RUNNING                     Pi still alive (or settling within grace); KEEP POLLING.
#
# Decision order is PROCESS-STATE-FIRST: once the process has exited we judge the
# RESULT (OK/FAIL) before ever considering wall-clock TIMEOUT or stall STALL — a
# Pi that already finished is terminal regardless of elapsed time. Only while the
# wrapper process is still ALIVE do the liveness guards (wall-clock, stall) apply.
#
# Success is gated on the rc FILE that the perl setsid wrapper writes with pi's REAL
# exit code (see pi-dispatch.sh). After the wrapper exits:
#   rc == 0                 -> STATUS=OK   (clean, terminal)
#   rc != 0                 -> STATUS=FAIL (pi exited bad; rc/exit in the tail)
#   NO rc file (past grace) -> STATUS=FAIL no-rc  (group-killed / truncated mid-run:
#                              the wrapper, group leader, died before writing rc —
#                              the killed/truncated signal — there is no rc to read)
# A pi-side ERROR (an error EVENT in the session jsonl) is a secondary safety net
# overriding even a non-empty result. The dead-but-no-rc case is bounded by a grace
# so it can never loop RUNNING forever — past the grace it becomes terminal FAIL.
#
# Three-state terminal sub-classes surfaced in the diagnostic tail:
#   (rc != 0)           STATUS=FAIL
#   wall-clock exceeded TIMEOUT  -> STATUS=FAIL
#   no fresh output     STALL    -> STATUS=FAIL
#   pi-side error event ERROR    -> STATUS=FAIL
#
# On a terminal FAIL detected while the wrapper is still ALIVE (TIMEOUT / STALL /
# pi-side ERROR), this script first calls pi-stop.sh to group-kill the orphan pi
# tree, then emits STATUS=FAIL — the cancel is closed in the script layer, not left
# to the agent. The dead branch needs no kill (the process already exited).
#
# Tunables (numeric, env-overridable):
#   PI_WALL_CLOCK_S        hard elapsed ceiling while alive   (default 900)
#   PI_STALL_THRESHOLD_S   max seconds with no output update  (default 300)
#   PI_NO_MARKER_GRACE_S   grace for dead-but-no-rc result     (default 30)

set -uo pipefail

# Locate our own script dir so we can invoke the sibling pi-stop.sh to cancel an
# orphan pi on a terminal FAIL (closed in the script layer, not via the agent).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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
RC_FILE="$RUNDIR/rc"
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

# Genuine liveness probe of the wrapper. rc=$? here is the kill -0 result, NOT pi's
# exit code (that lives in the rc FILE). The wrapper's system() blocks for pi's whole
# lifetime, so the wrapper is alive iff pi is still running.
kill -0 "$PI_PID" 2>/dev/null
alive_rc=$?

# Result size + a pi-side error-EVENT scan of the session jsonl, shared by both
# branches. macOS pi records a failed turn as a message event carrying
# "stopReason":"error" (verified on this darwin host) — we key on that error-event
# marker, NOT on free-answer prose, so a result that merely discusses the word
# errorMessage is never a false ERROR.
SZ=$(wc -c < "$OUTPUT_FILE" 2>/dev/null || echo 0)
SESSION_JSONL=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -1)
PI_ERROR=0
if [ -n "$SESSION_JSONL" ] && grep -q '"stopReason":"error"' "$SESSION_JSONL" 2>/dev/null; then PI_ERROR=1; fi

# Read pi's real exit code if the wrapper has written it.
PI_RC=""
[ -f "$RC_FILE" ] && PI_RC="$(cat "$RC_FILE" 2>/dev/null)"

# ---- PROCESS-STATE-FIRST: the wrapper has EXITED -> judge the result, terminal ----
if [ "$alive_rc" -ne 0 ]; then
  # pi-side error event wins: even a non-empty result is a failure if the turn errored.
  if [ "$PI_ERROR" -eq 1 ]; then
    echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE ERROR ${ELAPSED}s"
    exit 0
  fi
  # rc file present -> the wrapper recorded pi's real exit. rc==0 is the only OK.
  if [ -n "$PI_RC" ]; then
    if [ "$PI_RC" -eq 0 ]; then
      echo "STATUS=OK OUTPUT=$OUTPUT_FILE ${ELAPSED}s ${SZ}B rc=0"
      exit 0
    fi
    echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE exit rc=$PI_RC ${ELAPSED}s"
    exit 0
  fi
  # Dead with NO rc file = group-killed / crashed before the wrapper could record
  # the exit (truncated). Bound it with the no-rc grace so we never loop RUNNING
  # forever. ELAPSED grows monotonically (start-ts is fixed on disk), so it always
  # crosses the grace on a later poll -> terminal FAIL.
  if [ "$ELAPSED" -gt "$NO_MARKER_GRACE" ]; then
    echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE no-rc ${ELAPSED}s grace=${NO_MARKER_GRACE}s"
    exit 0
  fi
  echo "RUNNING settling ${ELAPSED}s (dead, awaiting rc within grace=${NO_MARKER_GRACE}s)"
  exit 0
fi

# ---- ALIVE: liveness guards (pi-side ERROR, wall-clock TIMEOUT, stall STALL) ----
# On any ALIVE-branch terminal FAIL the pi tree is still running, so we CANCEL it
# (group-kill via the sibling pi-stop.sh) BEFORE emitting STATUS=FAIL — closing the
# loop in the script layer so no orphan pi is left behind for the agent to chase.
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
