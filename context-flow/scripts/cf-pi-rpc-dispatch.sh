#!/usr/bin/env bash
# Launch Pi in --mode rpc, holding stdin open via fifo so the orchestrator
# can send commands and read events from rpc-events.jsonl across ephemeral
# Bash calls. Returns the pi PID immediately.
#
# Usage:   cf-pi-rpc-dispatch.sh SESSION
# Stdout:  PI_PID
# Side effects:
#   - mkfifo  $SESSION/rpc-stdin.fifo
#   - spawn   $SESSION/pi.pid           (pi --mode rpc, stdin from fifo)
#   - spawn   $SESSION/fifo-holder.pid  (sleep writer keeping fifo open)
#   - write   $SESSION/rpc-events.jsonl, rpc-stderr.log, rpc-start.ts
#   - sends   one {"type":"prompt","id":"initial","message":<brief>} via fifo
#
# Hard rules (mirrored from $PI_PROTOCOL §1, adapted for RPC):
#   - RPC commands carry literal "message" — embed the brief as a JSON string
#     (jq -Rs), not via @file (that shorthand is argv-only).
#   - Pass --provider/--model only when env-overridden.
#   - Always pass --session-dir.
#   - No -p (RPC has no print-and-exit semantics).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"
load_cf_pi_env "$session"

FIFO="$session/rpc-stdin.fifo"
EVENTS="$session/rpc-events.jsonl"
RPC_STDERR="$session/rpc-stderr.log"

[ -e "$FIFO" ] && rm -f "$FIFO"
mkfifo "$FIFO"
: > "$EVENTS"
: > "$RPC_STDERR"

date +%s > "$session/rpc-start.ts"

cd "$WORK"

# Step 1: spawn pi (child blocks opening fifo for read until a writer connects).
pi --mode rpc \
   ${PI_ARGS[@]+"${PI_ARGS[@]}"} \
   --session-dir "$PI_SESSION_DIR" \
   < "$FIFO" \
   > "$EVENTS" \
   2> "$RPC_STDERR" &
PI_PID=$!
echo "$PI_PID" > "$session/pi.pid"
disown "$PI_PID"

# Step 2: hold fifo open with a no-op writer. sleep writes nothing to stdout,
# it merely keeps a write-fd alive so pi's read doesn't see EOF when the
# initial-prompt jq pipe closes.
sleep 86400 > "$FIFO" &
HOLDER_PID=$!
echo "$HOLDER_PID" > "$session/fifo-holder.pid"
disown "$HOLDER_PID"

# Step 3: send the initial prompt command. jq -cRs: slurp brief as raw string,
# emit compact single-line JSON (RPC parses one command per line — pretty-print
# breaks parsing). Trailer instructs pi: after writing the report, the
# agent_end event signals the orchestrator to shut down. No "print DONE" —
# orchestrator keys off events.
jq -cRs --arg id "initial" '{
  type: "prompt",
  id: $id,
  message: (. + "\n\nRead the brief and execute it. When the report file is written, finish the turn — the agent_end event will signal completion.")
}' "$BRIEF_FILE" > "$FIFO"

echo "$PI_PID"
