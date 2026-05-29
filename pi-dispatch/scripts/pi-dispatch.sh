#!/usr/bin/env bash
# pi-dispatch.sh — offload one work brief to a Pi cheap/fast model.
#
# The point: Claude spends almost no tokens. It writes a small brief, calls this
# script, and reads back only the output-file path + a short tail. The heavy
# lifting (reading code, reasoning, producing the result) runs inside Pi on a
# cheap fast model, NOT in Claude's context.
#
# Usage:
#   pi-dispatch.sh BRIEF [OUTDIR]
#     BRIEF   — work description. Either a path to a brief file, or inline text.
#     OUTDIR  — where to write the run output (default: $TMPDIR/pi-dispatch).
#
# Stdout (last line): OUTPUT=<absolute path to result file>
#
# Routing (cheap/fast by default; override via env):
#   PI_PROVIDER  default: google
#   PI_MODEL     default: gemini-2.5-flash-lite
#
# Hard rule (mirrored from context-flow's PI_PROTOCOL §1):
#   Pass the brief via @"$BRIEF_FILE" — never via "$(cat $BRIEF_FILE)";
#   shell expansion of a large brief hangs Pi.

set -euo pipefail

BRIEF="${1:?usage: pi-dispatch.sh BRIEF [OUTDIR]}"
OUTDIR="${2:-${TMPDIR:-/tmp}/pi-dispatch}"

PROVIDER="${PI_PROVIDER:-google}"
MODEL="${PI_MODEL:-gemini-2.5-flash-lite}"

mkdir -p "$OUTDIR"
RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
SESSION_DIR="$OUTDIR/sessions"
OUTPUT_FILE="$OUTDIR/result-$RUN_ID.md"
mkdir -p "$SESSION_DIR"

# Normalize the brief into a file so we can hand it to Pi via @file (never via
# inline command substitution).
if [ -f "$BRIEF" ]; then
  BRIEF_FILE="$BRIEF"
else
  BRIEF_FILE="$OUTDIR/brief-$RUN_ID.md"
  printf '%s\n' "$BRIEF" > "$BRIEF_FILE"
fi

# Route the heavy work to the cheap/fast Pi model.
pi -p \
   --provider "$PROVIDER" \
   --model "$MODEL" \
   --session-dir "$SESSION_DIR" \
   @"$BRIEF_FILE" \
   "Read the brief above and complete it. Output only the result." \
   > "$OUTPUT_FILE" 2>&1

echo "OUTPUT=$OUTPUT_FILE"
