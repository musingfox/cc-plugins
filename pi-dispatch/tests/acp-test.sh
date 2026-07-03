#!/usr/bin/env bash
# acp-test.sh — committed behavior test for the pi-acp-* primitives. Pure-local,
# NO agent binary, NO network: a bash shim stands in for `omp acp`, speaking just
# enough JSONL ACP (initialize / session/new / session/prompt / request_permission)
# to exercise handshake, per-turn distill, warm second turn, permission round-trip,
# and pi-stop.sh teardown.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS="$HERE/../scripts"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1 (got: $2)"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- shim: a fake `omp acp` server reading frames from stdin (the fifo) ---------
SHIM="$TMP/omp-shim"
cat > "$SHIM" <<'SHIM_EOF'
#!/usr/bin/env bash
[ "${1:-}" = "acp" ] || { echo "shim: expected acp subcommand" >&2; exit 1; }
while IFS= read -r line; do
  method=$(printf '%s' "$line" | jq -r '.method // empty')
  id=$(printf '%s' "$line" | jq -r '.id // empty')
  case "$method" in
    initialize)
      printf '{"jsonrpc":"2.0","id":%s,"result":{"protocolVersion":1,"agentInfo":{"name":"shim"}}}\n' "$id" ;;
    session/new)
      printf '{"jsonrpc":"2.0","id":%s,"result":{"sessionId":"sess-test","modes":{"currentModeId":"default"}}}\n' "$id" ;;
    session/prompt)
      if [ "${ACP_SHIM_MODE:-plain}" = "perm" ]; then
        printf '{"jsonrpc":"2.0","id":99,"method":"session/request_permission","params":{"sessionId":"sess-test","toolCall":{"title":"bash"},"options":[{"optionId":"allow_once","name":"Allow"},{"optionId":"reject","name":"Reject"}]}}\n'
        while IFS= read -r ans; do
          [ "$(printf '%s' "$ans" | jq -r '.id // empty')" = "99" ] && break
        done
      fi
      printf '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-test","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"turn-%s "}}}}\n' "$id"
      printf '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess-test","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"done"}}}}\n'
      printf '{"jsonrpc":"2.0","id":%s,"result":{"stopReason":"end_turn","usage":{"totalTokens":10}}}\n' "$id" ;;
  esac
done
SHIM_EOF
chmod +x "$SHIM"

poll_until() {  # poll_until RUNDIR PATTERN -> echoes the matching line (empty on timeout)
  local d="$1" pat="$2" out=""
  for _ in $(seq 1 40); do
    out="$(bash "$SCRIPTS/pi-acp-poll.sh" "$d")"
    case "$out" in $pat) echo "$out"; return 0;; esac
    sleep 0.25
  done
  echo "$out"; return 1
}

# --- 1. start: handshake yields RUNDIR + SESSION -------------------------------
got="$(PI_BIN="$SHIM" bash "$SCRIPTS/pi-acp-start.sh" "$TMP/runs")"; rc=$?
RUNDIR="$(printf '%s\n' "$got" | sed -n 's/^RUNDIR=//p')"
echo "$got" | grep -q 'SESSION=sess-test' && [ "$rc" -eq 0 ] && [ -d "$RUNDIR" ] \
  && ok "start: handshake, SESSION + RUNDIR returned" || bad "start handshake" "$got rc=$rc"

# --- 2. poll before any prompt: IDLE -------------------------------------------
got="$(bash "$SCRIPTS/pi-acp-poll.sh" "$RUNDIR")"
[ "$got" = "IDLE session=sess-test" ] && ok "poll: IDLE before first prompt" || bad "poll idle" "$got"

# --- 3. prompt turn 1: DONE + distilled per-turn text ---------------------------
got="$(bash "$SCRIPTS/pi-acp-send.sh" "$RUNDIR" prompt "hello")"
[ "$got" = "SENT id=3" ] && ok "send: prompt returns SENT id=3" || bad "send prompt" "$got"
got="$(poll_until "$RUNDIR" 'STATUS=DONE*')"
echo "$got" | grep -q 'STATUS=DONE id=3 stopReason=end_turn' && ok "poll: turn 1 DONE" || bad "poll turn1" "$got"
text="$(cat "$RUNDIR/result.md")"
[ "$text" = "turn-3 done" ] && ok "distill: turn 1 text" || bad "distill turn1" "$text"

# --- 4. warm turn 2: offset isolates this turn's text ---------------------------
bash "$SCRIPTS/pi-acp-send.sh" "$RUNDIR" prompt "again" >/dev/null
got="$(poll_until "$RUNDIR" 'STATUS=DONE id=4*')"
text="$(cat "$RUNDIR/result.md")"
[ "$text" = "turn-4 done" ] && ok "distill: turn 2 text only (offset)" || bad "distill turn2" "$text"

# --- 5. permission round-trip ----------------------------------------------------
got="$(PI_BIN="$SHIM" ACP_SHIM_MODE=perm bash "$SCRIPTS/pi-acp-start.sh" "$TMP/runs")"
RUNDIR2="$(printf '%s\n' "$got" | sed -n 's/^RUNDIR=//p')"
bash "$SCRIPTS/pi-acp-send.sh" "$RUNDIR2" prompt "do work" >/dev/null
got="$(poll_until "$RUNDIR2" 'PERMISSION*')"
[ "$got" = "PERMISSION id=99 tool=bash options=allow_once|reject" ] \
  && ok "poll: pending permission surfaced" || bad "poll permission" "$got"
got="$(bash "$SCRIPTS/pi-acp-send.sh" "$RUNDIR2" permission allow_once)"
[ "$got" = "ANSWERED id=99 option=allow_once" ] && ok "send: permission answered" || bad "send permission" "$got"
got="$(poll_until "$RUNDIR2" 'STATUS=DONE*')"
echo "$got" | grep -q 'stopReason=end_turn' && ok "poll: turn completes after permission" || bad "poll after perm" "$got"

# --- 6. teardown via existing pi-stop.sh → DEAD ----------------------------------
bash "$SCRIPTS/pi-stop.sh" "$RUNDIR" >/dev/null
bash "$SCRIPTS/pi-stop.sh" "$RUNDIR2" >/dev/null
got="$(poll_until "$RUNDIR" 'STATUS=DEAD*')"
case "$got" in STATUS=DEAD*) ok "stop: pi-stop.sh kills session, poll reports DEAD";; *) bad "stop dead" "$got";; esac

echo "---"
echo "acp-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
