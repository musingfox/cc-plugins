#!/usr/bin/env bash
# pi-acp-start.sh — START a persistent ACP worker session (omp acp) in the BACKGROUND.
#
# ACP is the interactive counterpart to pi-dispatch.sh's fire-and-forget `-p` mode:
# the worker stays alive between turns (warm multi-turn), every tool call comes back
# to the client as a session/request_permission (mid-flight governance), and a turn
# can be cancelled at the protocol level without killing the session. Use it when
# the caller needs to steer; keep using pi-dispatch.sh for batch offload.
#
# Usage:
#   pi-acp-start.sh [--resume SESSION_ID] [OUTDIR [CWD]]
#     --resume SESSION_ID — restore a prior ACP session's context via session/load
#                           (omp persists sessions on disk; works across processes).
#     OUTDIR — base dir for run artifacts (default: $PI_RUNS_DIR/pi-acp).
#     CWD    — the session's working directory (default: $PWD).
#
# Stdout (after a bounded handshake wait, ~20s max):
#   RUNDIR=<per-run dir>   SESSION=<acp session id>   PID=<wrapper pid == PGID>
#
# Wire model (JSONL over stdio, NOT LSP framing):
#   stdin  <- $RUNDIR/in.fifo   (this script + pi-acp-send.sh write frames here)
#   stdout -> $RUNDIR/out.jsonl (all responses + session/update notifications)
# The worker opens the fifo O_RDWR (bash `0<>`), so it never sees EOF when a
# writer closes — each send just opens, writes one frame, closes.
#
# Process-group model: identical to pi-dispatch.sh (perl POSIX::setsid wrapper,
# pi.pid/pi.pgid/rc files) so the sibling pi-stop.sh tears the session down as-is.
#
# ponytail: model routing / configOptions not wired — omp's default model is used;
# add a session/set_config send when a non-default model is actually needed.

set -euo pipefail

PI_BIN="${PI_BIN:-omp}"

PRIOR_SESSION_ID=""
if [ "${1:-}" = "--resume" ]; then
  PRIOR_SESSION_ID="${2:?--resume needs a SESSION_ID}"
  shift 2
fi

OUTDIR="${1:-${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/pi-acp}"
SESSION_CWD="${2:-$PWD}"

RUN_ID="$(date +%Y%m%d-%H%M%S)-$$"
RUNDIR="$OUTDIR/acp-$RUN_ID"
FIFO="$RUNDIR/in.fifo"
OUT_FILE="$RUNDIR/out.jsonl"
STDERR_FILE="$RUNDIR/pi.stderr.log"
PID_FILE="$RUNDIR/pi.pid"
PGID_FILE="$RUNDIR/pi.pgid"
RC_FILE="$RUNDIR/rc"
START_FILE="$RUNDIR/pi-start.ts"
SESSION_FILE="$RUNDIR/session.id"
SEQ_FILE="$RUNDIR/req.seq"
mkdir -p "$RUNDIR"
mkfifo "$FIFO"
date +%s > "$START_FILE"

# Launch `omp acp` through the same perl setsid wrapper as pi-dispatch.sh. The
# inner bash exec opens the fifo read-write on fd 0 so the worker holds its own
# writer and never EOFs when a per-frame writer closes.
perl -MPOSIX -e '
  POSIX::setsid();
  my $rcfile = shift @ARGV;
  my $status = system(@ARGV);
  my $rc;
  if ($status == -1)        { $rc = 127; }
  elsif ($status & 127)     { $rc = 128 + ($status & 127); }
  else                      { $rc = $status >> 8; }
  open(my $fh, ">", $rcfile) or exit 255;
  print $fh "$rc\n";
  close($fh);
' "$RC_FILE" \
  bash -c 'exec "$0" acp 0<> "$1"' "$PI_BIN" "$FIFO" \
  > "$OUT_FILE" 2> "$STDERR_FILE" &

WRAP_PID=$!
printf '%s\n' "$WRAP_PID" > "$PID_FILE"
printf '%s\n' "$WRAP_PID" > "$PGID_FILE"
disown

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Handshake: initialize (id=1), then session/new or session/load (id=2).
# Frames are small (< PIPE_BUF) and writers are sequential, so plain printf > fifo
# is atomic enough. Opening the fifo for write blocks until the worker has it open.
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":false,"writeTextFile":false}}}}' > "$FIFO"
if [ -n "$PRIOR_SESSION_ID" ]; then
  jq -cn --arg sid "$PRIOR_SESSION_ID" --arg cwd "$SESSION_CWD" \
    '{jsonrpc:"2.0",id:2,method:"session/load",params:{sessionId:$sid,cwd:$cwd,mcpServers:[]}}' > "$FIFO"
else
  jq -cn --arg cwd "$SESSION_CWD" \
    '{jsonrpc:"2.0",id:2,method:"session/new",params:{cwd:$cwd,mcpServers:[]}}' > "$FIFO"
fi

# Bounded wait for the id=2 response; on session/new it carries the sessionId.
SESSION_ID=""
for _ in $(seq 1 40); do
  if [ -s "$OUT_FILE" ]; then
    resp="$(jq -cR 'fromjson? // empty | select(.id==2 and .method==null)' "$OUT_FILE" | head -1)"
    if [ -n "$resp" ]; then
      if printf '%s' "$resp" | jq -e '.error' >/dev/null 2>&1; then
        "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
        echo "pi-acp-start: handshake error: $(printf '%s' "$resp" | jq -c '.error')" >&2
        exit 1
      fi
      SESSION_ID="$(printf '%s' "$resp" | jq -r '.result.sessionId // empty')"
      [ -z "$SESSION_ID" ] && SESSION_ID="$PRIOR_SESSION_ID"
      break
    fi
  fi
  sleep 0.5
done

if [ -z "$SESSION_ID" ]; then
  "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR" >/dev/null 2>&1
  echo "pi-acp-start: handshake timed out (no session response); see $STDERR_FILE" >&2
  exit 1
fi

printf '%s\n' "$SESSION_ID" > "$SESSION_FILE"
printf '2\n' > "$SEQ_FILE"

echo "RUNDIR=$RUNDIR"
echo "SESSION=$SESSION_ID"
echo "PID=$WRAP_PID"
