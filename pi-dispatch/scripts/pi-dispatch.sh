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
#   PID=<background pi pid>
#   STATUSFILE=<path to done-marker (pi's exit code lands here when it finishes)>
#   RUNDIR=<per-run dir holding result/stderr/pid/done>
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
#   - pi runs in a background subshell; its real exit code is captured with `|| rc=$?`
#     and persisted to the done-marker so set -e cannot silently swallow a failure.

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
DONE_FILE="$RUNDIR/done"
mkdir -p "$SESSION_DIR"

# Normalize the brief into a file so we can hand it to Pi via @file (never via
# inline command substitution).
if [ -f "$BRIEF" ]; then
  BRIEF_FILE="$BRIEF"
else
  BRIEF_FILE="$RUNDIR/brief.md"
  printf '%s\n' "$BRIEF" > "$BRIEF_FILE"
fi

# Launch Pi in the BACKGROUND. The subshell inherits `set -e`, so pi MUST sit in
# an `|| rc=$?` list — otherwise a non-zero pi exit aborts the subshell before the
# done-marker is written and the failure is lost silently. result -> stdout file,
# diagnostics -> separate stderr file (streams stay split; no 2>and1 merge).
(
  rc=0
  pi -p \
     --provider "$PROVIDER" \
     --model "$MODEL" \
     --session-dir "$SESSION_DIR" \
     @"$BRIEF_FILE" \
     "Read the brief above and complete it. Output only the result." \
     > "$OUTPUT_FILE" 2> "$STDERR_FILE" || rc=$?
  printf '%s\n' "$rc" > "$DONE_FILE"
) &
PI_PID=$!
printf '%s\n' "$PI_PID" > "$PID_FILE"
disown

# Return the handle immediately — do NOT block on Pi.
echo "OUTPUT=$OUTPUT_FILE"
echo "PID=$PI_PID"
echo "STATUSFILE=$DONE_FILE"
echo "RUNDIR=$RUNDIR"
