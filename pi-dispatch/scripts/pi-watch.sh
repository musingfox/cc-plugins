#!/usr/bin/env bash
# pi-watch.sh — one-shot, bounded observability snapshot of a dispatch run.
#
# pi-poll.sh answers "is it done?"; pi-watch.sh answers "what is it DOING?".
# Claude (or the dispatcher agent) calls this between polls to monitor a long
# run without reading the raw stream: which tool is executing, how many events,
# token usage, and the latest assistant text — a fixed handful of lines no
# matter how large the stream grows.
#
# Usage:
#   pi-watch.sh HANDLE
#     HANDLE — the RUNDIR (from pi-dispatch.sh) or the OUTPUT result path.
#
# Stdout (fixed shape, one snapshot):
#   WATCH RUN=<basename> ELAPSED=<s> EVENTS=<n> BYTES=<n> TERMINAL=<yes|no>
#   TOOLS done=<ends>/<starts> last=<toolName|none>
#   TOKENS ctx=<last assistant totalTokens> out=<sum assistant output tokens>
#   TEXT <latest assistant text, first 200 chars, newlines flattened; "-" if none>
#
# Source: the json event stream — result.md while the run is live (raw stream),
# pi.stream.jsonl after pi-poll.sh's distill. Partial trailing lines (mid-write)
# are skipped, so watching a live stream is always safe.

set -uo pipefail

HANDLE="${1:?usage: pi-watch.sh HANDLE (RUNDIR or OUTPUT path)}"

if [ -d "$HANDLE" ]; then
  RUNDIR="$HANDLE"
else
  RUNDIR="$(dirname "$HANDLE")"
fi

# After distill, result.md is prose and the raw stream lives in pi.stream.jsonl.
STREAM="$RUNDIR/result.md"
[ -f "$RUNDIR/pi.stream.jsonl" ] && STREAM="$RUNDIR/pi.stream.jsonl"

START="$(cat "$RUNDIR/pi-start.ts" 2>/dev/null || true)"
NOW=$(date +%s)
ELAPSED=$(( NOW - ${START:-$NOW} ))
BYTES=$(wc -c < "$STREAM" 2>/dev/null | tr -d ' ' || echo 0)

if [ ! -s "$STREAM" ]; then
  echo "WATCH RUN=$(basename "$RUNDIR") ELAPSED=${ELAPSED}s EVENTS=0 BYTES=0 TERMINAL=no"
  echo "TOOLS done=0/0 last=none"
  echo "TOKENS ctx=0 out=0"
  echo "TEXT -"
  exit 0
fi

# Single pass: parse each line defensively (fromjson? skips a partial tail line),
# then reduce to the snapshot fields.
jq -rRn --arg run "$(basename "$RUNDIR")" --arg elapsed "$ELAPSED" --arg bytes "$BYTES" '
  [inputs | fromjson? // empty] as $ev |
  ($ev | map(select(.type == "tool_execution_start"))) as $ts |
  ($ev | map(select(.type == "tool_execution_end"))) as $te |
  ($ev | map(select(.type == "message_end" and .message.role == "assistant"))) as $am |
  ($am | map(.message.content // [] | map(select(.type == "text") | .text) | join("\n")) | map(select(length > 0)) | last // "-") as $text |
  "WATCH RUN=\($run) ELAPSED=\($elapsed)s EVENTS=\($ev | length) BYTES=\($bytes) TERMINAL=\(if any($ev[]; .type == "agent_end") then "yes" else "no" end)",
  "TOOLS done=\($te | length)/\($ts | length) last=\($ts | last | .toolName // "none")",
  "TOKENS ctx=\($am | last | .message.usage.totalTokens // 0) out=\($am | map(.message.usage.output // 0) | add // 0)",
  "TEXT \($text | gsub("[\\r\\n\\t]+"; " ") | .[0:200])"
' "$STREAM" 2>/dev/null || {
  echo "WATCH RUN=$(basename "$RUNDIR") ELAPSED=${ELAPSED}s EVENTS=? BYTES=$BYTES TERMINAL=?"
  echo "TOOLS done=?/? last=?"
  echo "TOKENS ctx=? out=?"
  echo "TEXT (stream unparseable)"
}
exit 0
