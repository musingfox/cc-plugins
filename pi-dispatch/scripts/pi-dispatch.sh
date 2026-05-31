#!/usr/bin/env bash
# pi-dispatch.sh — LAUNCH a work brief on a Pi cheap/fast model in the BACKGROUND.
#
# The point: Claude spends almost no tokens. It writes a small brief, calls this
# script, and gets back an OUTPUT path + a run handle IMMEDIATELY (non-blocking).
# Pi does the heavy lifting in the background on a cheap fast model; the caller
# polls for completion with pi-poll.sh instead of blocking on one long Bash call.
#
# Usage:
#   pi-dispatch.sh BRIEF [OUTDIR]
#     BRIEF   — work description. Either a path to a brief file, or inline text.
#     OUTDIR  — base dir for run artifacts (default: $TMPDIR/pi-dispatch).
#
# Stdout (returns instantly, does NOT wait for Pi):
#   OUTPUT=<absolute path to result file>     <- the handle the caller reads later
#   PID=<background pi pid>                    <- REAL pi pid (no subshell wrapper)
#   RUNDIR=<per-run dir holding result/stderr/pid/start>
#
# Routing (cheap/fast by default; override via env):
#   PI_PROVIDER  default: google
#   PI_MODEL     default: gemini-2.5-flash-lite
#
# Hard rules:
#   - Pass the brief via @"$BRIEF_FILE" — never via "$(cat $BRIEF_FILE)";
#     shell expansion of a large brief hangs Pi.
#   - stdout (the result) and stderr (diagnostics) go to SEPARATE files.
#     Never merge them — no 2>and1 here, on purpose.
#   - Background pi DIRECTLY (`pi … &`) so $! is pi's REAL pid — never a subshell
#     wrapper, whose pid would be the subshell, not pi. That real pid is what
#     pi-stop.sh kills (process tree included). Success is confirmed by a sentinel
#     (__PI_DISPATCH_DONE__) that pi itself prints as the LAST line of its result;
#     pi-poll.sh treats a process-exit WITH that trailing sentinel as OK, and a
#     process-exit WITHOUT it (e.g. SIGKILL mid-write) as a truncated FAIL. The
#     sentinel comes from pi via the prompt — NOT from a shell wrapper — so the
#     backgrounded pid stays pi's real pid.

set -euo pipefail

BRIEF="${1:?usage: pi-dispatch.sh BRIEF [OUTDIR]}"
OUTDIR="${2:-${TMPDIR:-/tmp}/pi-dispatch}"

PROVIDER="${PI_PROVIDER:-google}"
MODEL="${PI_MODEL:-gemini-2.5-flash-lite}"

RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
RUNDIR="$OUTDIR/run-$RUN_ID"
SESSION_DIR="$RUNDIR/sessions"
OUTPUT_FILE="$RUNDIR/result.md"
STDERR_FILE="$RUNDIR/pi.stderr.log"
PID_FILE="$RUNDIR/pi.pid"
START_FILE="$RUNDIR/pi-start.ts"
mkdir -p "$SESSION_DIR"

# Normalize the brief into a file so we can hand it to Pi via @file (never via
# inline command substitution).
if [ -f "$BRIEF" ]; then
  BRIEF_FILE="$BRIEF"
else
  BRIEF_FILE="$RUNDIR/brief.md"
  printf '%s\n' "$BRIEF" > "$BRIEF_FILE"
fi

# Record the start wall-clock (epoch seconds). pi-poll.sh reads this same start
# file to compute elapsed for wall-clock + no-marker-grace decisions.
date +%s > "$START_FILE"

# Launch Pi in the BACKGROUND, DIRECTLY (no subshell wrapper). $! is therefore the
# REAL pi pid — exactly what pi-stop.sh needs to kill the whole tree. result ->
# stdout file, diagnostics -> separate stderr file (streams stay split; no 2>and1).
pi -p \
   --provider "$PROVIDER" \
   --model "$MODEL" \
   --session-dir "$SESSION_DIR" \
   @"$BRIEF_FILE" \
   "Read the brief above and complete it. Output only the result. Then, on a final line by itself, print exactly this sentinel and nothing after it: __PI_DISPATCH_DONE__" \
   > "$OUTPUT_FILE" 2> "$STDERR_FILE" &
PI_PID=$!
printf '%s\n' "$PI_PID" > "$PID_FILE"
disown

# Return the handle immediately — do NOT block on Pi.
echo "OUTPUT=$OUTPUT_FILE"
echo "PID=$PI_PID"
echo "RUNDIR=$RUNDIR"
