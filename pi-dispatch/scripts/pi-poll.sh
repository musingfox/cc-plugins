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
#   STATUS=OK   OUTPUT=<path>   CLEAN-SUCCESS WHITELIST: agent_end.stopReason==stop AND
#                               non-empty result text AND process dead.
#   STATUS=FAIL OUTPUT=<path>   Anything else: rc!=0 / no-rc (killed) / stopReason!=stop
#                               (error/aborted/toolUse) / absent agent_end / empty result.
#   RUNNING                     Pi still alive (or settling within grace); KEEP POLLING.
#
# Decision order is PROCESS-STATE-FIRST: once the process has exited we judge the
# RESULT (OK/FAIL) before ever considering wall-clock TIMEOUT or stall STALL — a
# Pi that already finished is terminal regardless of elapsed time. The same intent
# applies even while ALIVE: if an agent_end is already in the stream the agent loop
# is over, so we group-kill the lingering wrapper and judge the result immediately
# rather than burning the stall window. Only when ALIVE *and* no agent_end yet do
# the liveness guards (wall-clock, stall) apply.
#
# Terminal state source (load-bearing for the hybrid stack):
#   The terminal state is the stopReason of the LAST assistant message in the json
#   event STREAM captured in result.md (pi invoked with --mode json). We extract it
#   from the agent_end line with jq:
#     AGENT_END=$(grep '"type":"agent_end"' result.md | tail -1)
#     STOP_REASON=$(printf '%s' "$AGENT_END" | jq -r '.messages[-1].stopReason // "unknown"')
#   The sessions/*.jsonl is NOT the source for terminal state (kept only for debugging).
#
# rc demotion: rc is ONLY an abnormal-death backstop. rc==0 NEVER implies OK on its
# own. An absent agent_end OVERRIDES a clean rc — the process exited but did not
# emit a terminal event (died mid-stream).
#
# Success WHITELIST: agent_end present AND stopReason=="stop" AND result non-empty.
#
# Terminal FAIL sub-classes surfaced in the diagnostic tail:
#   (rc != 0)                    STATUS=FAIL  exit rc=N        (rc backstop)
#   wall-clock exceeded TIMEOUT  STATUS=FAIL  (ALIVE liveness guard)
#   no fresh output     STALL    STATUS=FAIL  (ALIVE liveness guard)
#   terminal == error   ERROR    STATUS=FAIL  (dead-branch whitelist)
#   terminal not "stop"          STATUS=FAIL  not-stop (dead-branch whitelist)
#   empty result                 STATUS=FAIL  empty    (dead-branch whitelist)
#   no agent_end + rc==0         STATUS=FAIL  died-mid-stream
#   no agent_end + no-rc         STATUS=FAIL  no-rc
#
# On terminal OK, pi-poll.sh distills the assistant text from the agent_end event
# and writes it as the canonical human-readable result.md, preserving the raw stream
# alongside as pi.stream.jsonl.
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
STREAM_FILE="$RUNDIR/pi.stream.jsonl"

# --- persistent run index -------------------------------------------------
# Every TERMINAL outcome (a STATUS=* line) is appended to a durable index that
# lives OUTSIDE $TMPDIR, so a failed run stays diagnosable long after the (now
# also persistent) RUNDIR would otherwise have been purged. RUNNING lines are
# never recorded. The label column is the RUNDIR's parent dir name — i.e. which
# plugin dispatched it (pi-dispatch / spiral) — so one index serves all callers.
# All writes are best-effort (|| true): observability must never fail a poll.
PI_RUNS_DIR="${PI_RUNS_DIR:-$HOME/.cache/pi-runs}"
emit() {
  case "$1" in
    STATUS=*)
      mkdir -p "$PI_RUNS_DIR" 2>/dev/null || true
      printf '%s\t%s\t%s\t%s\n' \
        "$(date +%Y-%m-%dT%H:%M:%S%z)" \
        "$(basename "$(dirname "$RUNDIR")")" \
        "$1" "$RUNDIR" \
        >> "$PI_RUNS_DIR/index.log" 2>/dev/null || true
      ;;
  esac
  echo "$1"
}

# Broken handle — nothing to poll. Terminal FAIL so the caller doesn't loop forever.
if [ ! -f "$PID_FILE" ]; then
  emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE handle=broken"
  exit 0
fi

PI_PID="$(cat "$PID_FILE" 2>/dev/null)"
[ -z "$PI_PID" ] && { emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE no-pid"; exit 0; }

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

# --- Terminal state from the json event STREAM (result.md) ----------------
# The terminal state is read from the json event stream captured in result.md.
# We look for the agent_end event (the last one if multiple) and extract the
# stopReason from the last assistant message structurally via jq. This is the
# HYBRID design: --mode json makes pi emit a stream, agent_end.stopReason is the
# load-bearing terminal signal. sessions/*.jsonl is NOT the source here.
AGENT_END_LINE=""
STOP_REASON=""
DISTILLED_TEXT=""
if [ -f "$OUTPUT_FILE" ]; then
  AGENT_END_LINE="$(grep '"type":"agent_end"' "$OUTPUT_FILE" 2>/dev/null | tail -1 || true)"
  if [ -n "$AGENT_END_LINE" ]; then
    STOP_REASON="$(printf '%s' "$AGENT_END_LINE" | jq -r '.messages[-1].stopReason // "unknown"' 2>/dev/null || true)"
    DISTILLED_TEXT="$(printf '%s' "$AGENT_END_LINE" | jq -r '.messages[-1].text // ""' 2>/dev/null || true)"
  fi
fi

# Result size (raw stream bytes while running; will be updated if we distill on OK).
SZ=$(wc -c < "$OUTPUT_FILE" 2>/dev/null || echo 0)

# Read pi's real exit code if the wrapper has written it.
PI_RC=""
[ -f "$RC_FILE" ] && PI_RC="$(cat "$RC_FILE" 2>/dev/null)"

# Judge an already-present agent_end against the success WHITELIST and emit a
# terminal line. Assumes $AGENT_END_LINE is non-empty (caller checked). Shared by
# the dead branch (rc==0) and the ALIVE short-circuit — an agent_end means the
# agent loop is OVER, so the result is terminal regardless of process liveness.
judge_agent_end() {
  if [ "$STOP_REASON" = "error" ]; then
    emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE ERROR terminal=error ${ELAPSED}s"
    exit 0
  fi
  if [ "$STOP_REASON" != "stop" ]; then
    emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE terminal=${STOP_REASON:-none} not-stop ${ELAPSED}s"
    exit 0
  fi
  # stopReason == stop: check result text is non-empty. Empty text == the agent
  # ended its turn (e.g. thinking-only) without producing any actionable output.
  if [ -z "$DISTILLED_TEXT" ]; then
    emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE empty 0B terminal=stop ${ELAPSED}s"
    exit 0
  fi
  # Full whitelist satisfied: agent_end + stopReason==stop + non-empty text.
  # Distill: save raw stream as pi.stream.jsonl, write human-readable result.md.
  cp "$OUTPUT_FILE" "$STREAM_FILE" 2>/dev/null || true
  printf '%s\n' "$DISTILLED_TEXT" > "$OUTPUT_FILE" 2>/dev/null || true
  SZ=$(wc -c < "$OUTPUT_FILE" 2>/dev/null || echo 0)
  emit "STATUS=OK OUTPUT=$OUTPUT_FILE ${ELAPSED}s ${SZ}B rc=0 terminal=stop"
  exit 0
}

# ---- PROCESS-STATE-FIRST: the wrapper has EXITED -> judge the result, terminal ----
if [ "$alive_rc" -ne 0 ]; then
  # rc file present -> the wrapper recorded pi's real exit.
  # rc is DEMOTED: it is only an abnormal-death backstop, not the success gate.
  # The WHITELIST gate is agent_end presence + stopReason=="stop" + non-empty text.
  if [ -n "$PI_RC" ]; then
    # rc != 0 is an abnormal-death backstop: surface immediately, no further checks.
    if [ "$PI_RC" -ne 0 ]; then
      emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE exit rc=$PI_RC ${ELAPSED}s"
      exit 0
    fi
    # rc == 0: now check agent_end. Absent agent_end overrides a clean rc —
    # the process died mid-stream without emitting a terminal event.
    if [ -z "$AGENT_END_LINE" ]; then
      emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE died-mid-stream no-terminal ${ELAPSED}s"
      exit 0
    fi
    # agent_end present: judge stopReason via the shared whitelist.
    judge_agent_end
  fi
  # Dead with NO rc file = group-killed / crashed before the wrapper could record
  # the exit (truncated). Bound it with the no-rc grace so we never loop RUNNING
  # forever. ELAPSED grows monotonically (start-ts is fixed on disk), so it always
  # crosses the grace on a later poll -> terminal FAIL.
  if [ "$ELAPSED" -gt "$NO_MARKER_GRACE" ]; then
    emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE no-rc ${ELAPSED}s grace=${NO_MARKER_GRACE}s"
    exit 0
  fi
  echo "RUNNING settling ${ELAPSED}s (dead, awaiting rc within grace=${NO_MARKER_GRACE}s)"
  exit 0
fi

# ---- ALIVE: agent already finished? then it's terminal, don't wait for death ----
# An agent_end in the stream means the agent loop is OVER; a wrapper that lingers
# alive afterwards will produce nothing more. Judging now (after group-killing the
# orphan) avoids burning the whole stall window on a run that already ended — this
# is the "a finished Pi is terminal regardless of elapsed time" intent applied even
# while the wrapper is still up.
if [ -n "$AGENT_END_LINE" ]; then
  "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
  judge_agent_end
fi

# ---- ALIVE: liveness guards (wall-clock TIMEOUT, stall STALL) ----
# On any ALIVE-branch terminal FAIL the pi tree is still running, so we CANCEL it
# (group-kill via the sibling pi-stop.sh) BEFORE emitting STATUS=FAIL — closing the
# loop in the script layer so no orphan pi is left behind for the agent to chase.
#
# Event-aware stall: if the last line of result.md is a tool_execution_start event,
# double the stall threshold (pi is actively working on a long tool call).
if [ "$ELAPSED" -gt "$WALL_CLOCK" ]; then
  "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
  emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE TIMEOUT ${ELAPSED}s wall=${WALL_CLOCK}s"
  exit 0
fi
# Stall: portable mtime of the output file (primary artifact being written).
MTIME=$(stat -f %m "$OUTPUT_FILE" 2>/dev/null || stat -c %Y "$OUTPUT_FILE" 2>/dev/null || echo "$NOW")
STALE=$((NOW - MTIME))

# Event-aware stall doubling: if pi is in the middle of a tool execution, double
# the threshold to avoid killing a legitimately long-running tool call.
EFFECTIVE_STALL="$STALL_THRESHOLD"
if [ -f "$OUTPUT_FILE" ]; then
  LAST_TYPE="$(tail -1 "$OUTPUT_FILE" 2>/dev/null | jq -r '.type // ""' 2>/dev/null || true)"
  if [ "$LAST_TYPE" = "tool_execution_start" ]; then
    EFFECTIVE_STALL=$((STALL_THRESHOLD * 2))
  fi
fi

if [ "$STALE" -gt "$EFFECTIVE_STALL" ]; then
  "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
  emit "STATUS=FAIL OUTPUT=$OUTPUT_FILE STALL ${ELAPSED}s stale=${STALE}s thr=${EFFECTIVE_STALL}s"
  exit 0
fi

# Still alive, within all guards, not yet finished — keep polling (non-terminal).
echo "RUNNING ${ELAPSED}s ${SZ}B stale=${STALE}s"
exit 0
