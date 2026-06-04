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
#   STATUS=OK   OUTPUT=<path>   CLEAN-SUCCESS WHITELIST: rc==0 AND non-empty result
#                               AND terminal state == "stop". Terminal.
#   STATUS=FAIL OUTPUT=<path>   Anything else: rc!=0 / no-rc (killed) / terminal state
#                               not "stop" (error/aborted/toolUse) / empty result. Terminal.
#   RUNNING                     Pi still alive (or settling within grace); KEEP POLLING.
#
# Decision order is PROCESS-STATE-FIRST: once the process has exited we judge the
# RESULT (OK/FAIL) before ever considering wall-clock TIMEOUT or stall STALL — a
# Pi that already finished is terminal regardless of elapsed time. Only while the
# wrapper process is still ALIVE do the liveness guards (wall-clock, stall) apply.
#
# Success is a WHITELIST, not just rc. The rc FILE (written by the perl setsid wrapper
# with pi's REAL exit code, see pi-dispatch.sh) is necessary but NOT sufficient.
# After the wrapper exits, a clean OK requires ALL of:
#   rc == 0  AND  result non-empty  AND  terminal state == "stop".
# Otherwise:
#   rc != 0                 -> STATUS=FAIL (pi exited bad; rc/exit in the tail)
#   terminal != "stop"      -> STATUS=FAIL (error/aborted/toolUse — not a clean finish;
#                              "error" gets the ERROR sub-class)
#   rc==0 + terminal stop + empty result -> STATUS=FAIL empty (success state, no answer)
#   NO rc file (past grace) -> STATUS=FAIL no-rc  (group-killed / truncated mid-run:
#                              the wrapper, group leader, died before writing rc —
#                              the killed/truncated signal — there is no rc to read)
# The terminal state is the stopReason of the LAST assistant message in the session
# jsonl, extracted structurally with jq (NOT a whole-file substring scan), so an
# intermediate error/toolUse turn that later RECOVERS to "stop" is a clean success.
# The dead-but-no-rc case is bounded by a grace so it can never loop RUNNING forever.
#
# Terminal FAIL sub-classes surfaced in the diagnostic tail:
#   (rc != 0)                    STATUS=FAIL  exit rc=N
#   wall-clock exceeded TIMEOUT  STATUS=FAIL  (ALIVE liveness guard)
#   no fresh output     STALL    STATUS=FAIL  (ALIVE liveness guard)
#   terminal == error   ERROR    STATUS=FAIL  (dead-branch whitelist)
#   terminal not "stop"          STATUS=FAIL  not-stop (dead-branch whitelist)
#   empty result                 STATUS=FAIL  empty    (dead-branch whitelist)
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

# Result size + the TERMINAL STATE of the run, shared by both branches.
#
# TERMINAL STATE (the load-bearing success signal): the stopReason of the LAST
# assistant message in the session jsonl. Verified across 40 real pi sessions on
# this darwin host, a run's last-assistant terminal state is one of
# stop / aborted / error / toolUse — and ONLY "stop" is a clean success. We extract
# it STRUCTURALLY with jq (host has jq, verified), keying on the final assistant
# message's terminal state — NOT on any whole-file substring scan and NOT on the
# free-answer prose. A result that merely quotes an error marker in its text, or a
# run that hit an intermediate toolUse/error turn but RECOVERED and ended on stop,
# is judged purely by that final structural state. jq reads the jsonl FILE (never
# stdin), so it can never block this poll.
SZ=$(wc -c < "$OUTPUT_FILE" 2>/dev/null || echo 0)
SESSION_JSONL=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -1)
TERMINAL=""
if [ -n "$SESSION_JSONL" ]; then
  TERMINAL=$(jq -rn '[ inputs | select(.type=="message" and .message.role=="assistant") | .message.stopReason ] | last // empty' "$SESSION_JSONL" 2>/dev/null)
fi

# Read pi's real exit code if the wrapper has written it.
PI_RC=""
[ -f "$RC_FILE" ] && PI_RC="$(cat "$RC_FILE" 2>/dev/null)"

# ---- PROCESS-STATE-FIRST: the wrapper has EXITED -> judge the result, terminal ----
if [ "$alive_rc" -ne 0 ]; then
  # rc file present -> the wrapper recorded pi's real exit. A clean OK requires the
  # WHOLE whitelist: rc==0 AND a non-empty result AND the terminal state == "stop".
  if [ -n "$PI_RC" ]; then
    if [ "$PI_RC" -eq 0 ]; then
      # rc==0 but the run did NOT end cleanly on "stop" (error/aborted/toolUse/empty
      # terminal) -> NOT a clean success. Surface the real terminal state; never a
      # silent OK. "error" gets the explicit ERROR sub-class for the diagnostic tail.
      if [ "$TERMINAL" = "error" ]; then
        echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE ERROR terminal=error ${ELAPSED}s"
        exit 0
      fi
      if [ "$TERMINAL" != "stop" ]; then
        echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE terminal=${TERMINAL:-none} not-stop ${ELAPSED}s"
        exit 0
      fi
      # Terminal == stop, but the result file is EMPTY -> rc/terminal say success yet
      # there is no answer. Do NOT pass it off as a clean OK: emit the literal `empty`
      # marker so main can tell the difference from a real, non-empty success.
      if [ "$SZ" -eq 0 ]; then
        echo "STATUS=FAIL OUTPUT=$OUTPUT_FILE empty 0B terminal=stop ${ELAPSED}s"
        exit 0
      fi
      # Full whitelist satisfied: rc==0 AND non-empty AND terminal==stop.
      echo "STATUS=OK OUTPUT=$OUTPUT_FILE ${ELAPSED}s ${SZ}B rc=0 terminal=stop"
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

# ---- ALIVE: liveness guards (wall-clock TIMEOUT, stall STALL) ----
# On any ALIVE-branch terminal FAIL the pi tree is still running, so we CANCEL it
# (group-kill via the sibling pi-stop.sh) BEFORE emitting STATUS=FAIL — closing the
# loop in the script layer so no orphan pi is left behind for the agent to chase.
#
# NOTE: no pi-side ERROR check while ALIVE. Terminal state is the LAST assistant
# message's stopReason; a still-running pi may be mid-turn on a transient
# error/toolUse state that it then RECOVERS from and ends on "stop". Judging a live
# run by an intermediate state would wrongly kill recoverable runs, so the terminal
# whitelist is applied only once the wrapper has EXITED (the dead branch above).
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
