#!/usr/bin/env bash
# Classification semantics of cf-pi-poll.sh over the json-mode event stream.
#
# Completion/error come from the terminal agent_end event's stopReason, never
# from exit codes or report existence; liveness is event arrival with a
# state-aware stall threshold (doubled inside a tool call).

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
POLL="$REAL_SCRIPTS/cf-pi-poll.sh"

# Long-lived process for "alive" scenarios; reaped at the end.
sleep 60 & ALIVE_PID=$!
# Reaped process for "dead" scenarios.
true & DEAD_PID=$!
wait "$DEAD_PID" 2>/dev/null || true

# new_session PID  -> sets $S (session dir with env.sh, pid, start ts)
new_session() {
  S="$(mktemp -d)"
  cat > "$S/env.sh" <<EOF
SESSION="$S"
SESSION_BASENAME="poll-test"
PLUGIN_ROOT="$S"
SCRIPTS="$REAL_SCRIPTS"
PI_PROVIDER=""
PI_MODEL=""
PI_STALL_THRESHOLD_S=5
PI_WALL_CLOCK_S=1800
EOF
  echo "$1" > "$S/pi.pid"
  date +%s > "$S/pi-start.ts"
}

age_file() { perl -e 'my $t = time - $ARGV[1]; utime $t, $t, $ARGV[0]' "$1" "$2"; }

AGENT_END_OK='{"type":"agent_end","messages":[{"role":"assistant","stopReason":"stop"}]}'
AGENT_END_ERR='{"type":"agent_end","messages":[{"role":"assistant","stopReason":"error","errorMessage":"model exploded"}]}'

# 1. agent_end stop -> DONE (even though the process is gone and the file is stale)
new_session "$DEAD_PID"
printf '%s\n%s\n' '{"type":"session","id":"x"}' "$AGENT_END_OK" > "$S/pi-stdout.log"
age_file "$S/pi-stdout.log" 300
assert_contains "$(bash "$POLL" "$S")" "DONE" "agent_end stopReason=stop classifies DONE"

# 2. agent_end error -> ERROR with stopReason + excerpt
new_session "$DEAD_PID"
printf '%s\n%s\n' '{"type":"session","id":"x"}' "$AGENT_END_ERR" > "$S/pi-stdout.log"
out=$(bash "$POLL" "$S")
assert_contains "$out" "ERROR" "agent_end stopReason=error classifies ERROR"
assert_contains "$out" "model exploded" "ERROR carries the errorMessage excerpt"

# 3. process died mid-stream (events, no agent_end) -> ERROR
new_session "$DEAD_PID"
printf '%s\n%s\n' '{"type":"session","id":"x"}' '{"type":"message_start"}' > "$S/pi-stdout.log"
assert_contains "$(bash "$POLL" "$S")" "ERROR" "death without agent_end classifies ERROR"

# 4. alive + fresh events -> ALIVE
new_session "$ALIVE_PID"
printf '%s\n%s\n' '{"type":"session","id":"x"}' '{"type":"message_update"}' > "$S/pi-stdout.log"
assert_contains "$(bash "$POLL" "$S")" "ALIVE" "alive with fresh events classifies ALIVE"

# 5. alive + stale past threshold -> STALL
new_session "$ALIVE_PID"
printf '%s\n' '{"type":"message_update"}' > "$S/pi-stdout.log"
age_file "$S/pi-stdout.log" 10
assert_contains "$(bash "$POLL" "$S")" "STALL" "stale beyond threshold classifies STALL"

# 6. inside a tool call the threshold doubles: stale 8 (5 < 8 < 10) -> still ALIVE
new_session "$ALIVE_PID"
printf '%s\n%s\n' '{"type":"message_end"}' '{"type":"tool_execution_start"}' > "$S/pi-stdout.log"
age_file "$S/pi-stdout.log" 8
assert_contains "$(bash "$POLL" "$S")" "ALIVE" "quiet inside a tool call stays ALIVE up to 2x threshold"

# 7. inside a tool call but past 2x threshold -> STALL
new_session "$ALIVE_PID"
printf '%s\n' '{"type":"tool_execution_start"}' > "$S/pi-stdout.log"
age_file "$S/pi-stdout.log" 12
assert_contains "$(bash "$POLL" "$S")" "STALL" "tool-call quiet past 2x threshold is a STALL"

# 8. no events yet: alive within grace -> NO_JSONL; dead -> NO_JSONL_FAIL
new_session "$ALIVE_PID"
: > "$S/pi-stdout.log"
assert_contains "$(bash "$POLL" "$S")" "NO_JSONL" "alive with no events inside grace is NO_JSONL"
new_session "$DEAD_PID"
: > "$S/pi-stdout.log"
assert_contains "$(bash "$POLL" "$S")" "NO_JSONL_FAIL" "dead with no events is NO_JSONL_FAIL"

kill "$ALIVE_PID" 2>/dev/null || true
