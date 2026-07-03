#!/usr/bin/env bash
# pi-acp-poll.sh — STATELESS one-shot poll of an ACP session (pi-acp-start.sh).
#
# Emits exactly one line, exit 0. Unlike pi-poll.sh, "terminal" here is PER-TURN:
# STATUS=DONE ends a turn, the session stays alive for the next prompt.
#
# Usage: pi-acp-poll.sh RUNDIR
#
# Stdout — exactly one of (checked in this order):
#   STATUS=DEAD rc=<n|none>                 worker process gone (session over)
#   IDLE session=<sid>                      up, no prompt sent yet
#   STATUS=DONE id=<n> stopReason=<s> OUTPUT=<result.md>
#                                           current turn answered; this turn's
#                                           streamed text distilled to result.md
#   PERMISSION id=<n> tool=<title> options=<o1|o2|…>
#                                           worker blocked on a permission request;
#                                           answer with pi-acp-send.sh permission
#   RUNNING id=<n> <elapsed>s stale=<s>s    turn in flight; keep polling
#
# ponytail: no auto-kill liveness guards — ACP is interactively driven, the caller
# reads stale= and decides; add pi-poll.sh-style TIMEOUT/STALL if unattended use appears.

set -uo pipefail

RUNDIR="${1:?usage: pi-acp-poll.sh RUNDIR}"
OUT_FILE="$RUNDIR/out.jsonl"
SENT_FILE="$RUNDIR/sent.jsonl"
RESULT_FILE="$RUNDIR/result.md"

PI_PID="$(cat "$RUNDIR/pi.pid" 2>/dev/null)"
if [ -z "$PI_PID" ] || ! kill -0 "$PI_PID" 2>/dev/null; then
  echo "STATUS=DEAD rc=$(cat "$RUNDIR/rc" 2>/dev/null || echo none)"
  exit 0
fi

TURN_ID="$(cat "$RUNDIR/turn.id" 2>/dev/null)"
if [ -z "$TURN_ID" ]; then
  echo "IDLE session=$(cat "$RUNDIR/session.id" 2>/dev/null)"
  exit 0
fi

# Turn done? A response (not a server request — those carry .method) to turn.id.
RESP="$(jq -cR --argjson n "$TURN_ID" \
  'fromjson? // empty | select(.id==$n and .method==null and ((.result != null) or (.error != null)))' \
  "$OUT_FILE" 2>/dev/null | head -1)"
if [ -n "$RESP" ]; then
  STOP_REASON="$(printf '%s' "$RESP" | jq -r '.result.stopReason // .error.message // "unknown"')"
  OFFSET="$(cat "$RUNDIR/turn.offset" 2>/dev/null || echo 0)"
  # Distill just this turn's streamed text: chunks past the offset recorded at send.
  tail -c +"$((OFFSET + 1))" "$OUT_FILE" \
    | jq -jR 'fromjson? // empty | select(.params.update.sessionUpdate=="agent_message_chunk") | .params.update.content.text // empty' \
    > "$RESULT_FILE" 2>/dev/null || true
  echo "STATUS=DONE id=$TURN_ID stopReason=$STOP_REASON OUTPUT=$RESULT_FILE"
  exit 0
fi

# Pending permission? Requests in out.jsonl whose id has no answer in sent.jsonl.
answered="$(jq -cR 'fromjson? // empty | select(.result.outcome) | .id' "$SENT_FILE" 2>/dev/null | tr '\n' ' ')"
PERM="$(jq -cR --arg ans " $answered" \
  'fromjson? // empty | select(.method=="session/request_permission") | " \(.id) " as $needle | select(($ans | contains($needle)) | not)' \
  "$OUT_FILE" 2>/dev/null | head -1)"
if [ -n "$PERM" ]; then
  echo "PERMISSION id=$(printf '%s' "$PERM" | jq -r '.id') tool=$(printf '%s' "$PERM" | jq -r '.params.toolCall.title // "?"') options=$(printf '%s' "$PERM" | jq -r '[.params.options[].optionId] | join("|")')"
  exit 0
fi

START="$(cat "$RUNDIR/pi-start.ts" 2>/dev/null || date +%s)"
NOW=$(date +%s)
MTIME=$(stat -f %m "$OUT_FILE" 2>/dev/null || stat -c %Y "$OUT_FILE" 2>/dev/null || echo "$NOW")
echo "RUNNING id=$TURN_ID $((NOW - START))s stale=$((NOW - MTIME))s"
exit 0
