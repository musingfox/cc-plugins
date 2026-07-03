#!/usr/bin/env bash
# pi-acp-send.sh — SEND one frame into a live ACP session started by pi-acp-start.sh.
#
# All sends are NON-BLOCKING (write the frame into in.fifo and return); observe the
# effect with pi-acp-poll.sh. Every outgoing frame is also appended to sent.jsonl
# so the poller can tell answered permission requests from pending ones.
#
# Usage:
#   pi-acp-send.sh RUNDIR prompt TEXT_OR_FILE
#       Start the next turn (session/prompt). If TEXT_OR_FILE is an existing file
#       its content becomes the prompt text (the ACP prompt is inline; there is no
#       @file). Records the request id (turn.id) and the current out.jsonl byte
#       offset (turn.offset) so the poller can distill just this turn's text.
#   pi-acp-send.sh RUNDIR permission OPTION_ID [REQUEST_ID]
#       Answer a session/request_permission. REQUEST_ID defaults to the first
#       pending (unanswered) request in out.jsonl.
#   pi-acp-send.sh RUNDIR cancel
#       session/cancel the in-flight turn (protocol-level; the session survives —
#       for a hard teardown use pi-stop.sh instead).

set -euo pipefail

RUNDIR="${1:?usage: pi-acp-send.sh RUNDIR prompt|permission|cancel ...}"
ACTION="${2:?usage: pi-acp-send.sh RUNDIR prompt|permission|cancel ...}"

FIFO="$RUNDIR/in.fifo"
OUT_FILE="$RUNDIR/out.jsonl"
SESSION_ID="$(cat "$RUNDIR/session.id")"
SEQ_FILE="$RUNDIR/req.seq"
SENT_FILE="$RUNDIR/sent.jsonl"

send_frame() {
  printf '%s\n' "$1" >> "$SENT_FILE"
  printf '%s\n' "$1" > "$FIFO"
}

case "$ACTION" in
  prompt)
    ARG="${3:?prompt needs TEXT_OR_FILE}"
    NEXT_ID=$(( $(cat "$SEQ_FILE") + 1 ))
    printf '%s\n' "$NEXT_ID" > "$SEQ_FILE"
    printf '%s\n' "$NEXT_ID" > "$RUNDIR/turn.id"
    wc -c < "$OUT_FILE" | tr -d ' ' > "$RUNDIR/turn.offset"
    if [ -f "$ARG" ]; then
      frame="$(jq -cn --argjson id "$NEXT_ID" --arg sid "$SESSION_ID" --rawfile t "$ARG" \
        '{jsonrpc:"2.0",id:$id,method:"session/prompt",params:{sessionId:$sid,prompt:[{type:"text",text:$t}]}}')"
    else
      frame="$(jq -cn --argjson id "$NEXT_ID" --arg sid "$SESSION_ID" --arg t "$ARG" \
        '{jsonrpc:"2.0",id:$id,method:"session/prompt",params:{sessionId:$sid,prompt:[{type:"text",text:$t}]}}')"
    fi
    send_frame "$frame"
    echo "SENT id=$NEXT_ID"
    ;;
  permission)
    OPTION_ID="${3:?permission needs OPTION_ID}"
    REQ_ID="${4:-}"
    if [ -z "$REQ_ID" ]; then
      answered="$(jq -cR 'fromjson? // empty | select(.result.outcome) | .id' "$SENT_FILE" 2>/dev/null | tr '\n' ' ')"
      REQ_ID="$(jq -cR --arg ans " $answered" \
        'fromjson? // empty | select(.method=="session/request_permission") | .id | " \(.) " as $needle | select(($ans | contains($needle)) | not)' \
        "$OUT_FILE" | head -1)"
    fi
    [ -z "$REQ_ID" ] && { echo "pi-acp-send: no pending permission request" >&2; exit 1; }
    frame="$(jq -cn --argjson id "$REQ_ID" --arg opt "$OPTION_ID" \
      '{jsonrpc:"2.0",id:$id,result:{outcome:{outcome:"selected",optionId:$opt}}}')"
    send_frame "$frame"
    echo "ANSWERED id=$REQ_ID option=$OPTION_ID"
    ;;
  cancel)
    frame="$(jq -cn --arg sid "$SESSION_ID" \
      '{jsonrpc:"2.0",method:"session/cancel",params:{sessionId:$sid}}')"
    send_frame "$frame"
    echo "CANCELLED session=$SESSION_ID"
    ;;
  *)
    echo "pi-acp-send: unknown action '$ACTION' (prompt|permission|cancel)" >&2
    exit 1
    ;;
esac
