#!/usr/bin/env bash
# Classification semantics of cf-pi-poll.sh over the json-mode event stream.
#
# After the turn-5 migration, cf-pi-poll.sh is a thin adapter over the canonical
# pi-poll.sh. Fixtures use the canonical RUNDIR layout (result.md as the event
# stream, pi.pid in the RUNDIR) rather than the old cf layout (pi-stdout.log in the
# session dir). Assertions and expected outcomes are identical to the pre-migration
# test.

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
POLL="$REAL_SCRIPTS/cf-pi-poll.sh"

# Long-lived process for "alive" scenarios; reaped at the end.
sleep 60 & ALIVE_PID=$!
# Reaped process for "dead" scenarios.
true & DEAD_PID=$!
wait "$DEAD_PID" 2>/dev/null || true

# new_session PID  -> sets $S (session dir with env.sh + pi-rundir pointing to RUNDIR)
# The canonical RUNDIR is created at $S/run; fixtures write events to $S/run/result.md.
new_session() {
  local pid="$1"
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
  # Canonical RUNDIR.
  RUNDIR="$S/run"
  mkdir -p "$RUNDIR/sessions"
  echo "$pid" > "$RUNDIR/pi.pid"
  date +%s > "$RUNDIR/pi-start.ts"
  # Point the adapter to this RUNDIR.
  echo "$RUNDIR" > "$S/pi-rundir"
  # Keep a legacy pi-start.ts in the session for elapsed computation in the adapter.
  date +%s > "$S/pi-start.ts"
}

age_file() { perl -e 'my $t = time - $ARGV[1]; utime $t, $t, $ARGV[0]' "$1" "$2"; }

AGENT_END_OK='{"type":"agent_end","messages":[{"role":"assistant","stopReason":"stop","text":"ok"}]}'
AGENT_END_ERR='{"type":"agent_end","messages":[{"role":"assistant","stopReason":"error","errorMessage":"model exploded"}]}'

# 1. agent_end stop -> DONE (even though the process is gone and the file is stale)
new_session "$DEAD_PID"
printf '%s\n%s\n' '{"type":"session","id":"x"}' "$AGENT_END_OK" > "$RUNDIR/result.md"
# Write a non-zero rc so the canonical poll sees the process as dead with a clean rc.
echo "0" > "$RUNDIR/rc"
age_file "$RUNDIR/result.md" 300
assert_contains "$(bash "$POLL" "$S")" "DONE" "agent_end stopReason=stop classifies DONE"

# 2. agent_end error -> ERROR with stopReason + excerpt
new_session "$DEAD_PID"
printf '%s\n%s\n' '{"type":"session","id":"x"}' "$AGENT_END_ERR" > "$RUNDIR/result.md"
echo "0" > "$RUNDIR/rc"
out=$(bash "$POLL" "$S")
assert_contains "$out" "ERROR" "agent_end stopReason=error classifies ERROR"

# 3. process died mid-stream (events, no agent_end) -> ERROR
new_session "$DEAD_PID"
printf '%s\n%s\n' '{"type":"session","id":"x"}' '{"type":"message_start"}' > "$RUNDIR/result.md"
echo "0" > "$RUNDIR/rc"
assert_contains "$(bash "$POLL" "$S")" "ERROR" "death without agent_end classifies ERROR"

# 4. alive + fresh events -> ALIVE
new_session "$ALIVE_PID"
printf '%s\n%s\n' '{"type":"session","id":"x"}' '{"type":"message_update"}' > "$RUNDIR/result.md"
assert_contains "$(bash "$POLL" "$S")" "ALIVE" "alive with fresh events classifies ALIVE"

# 5. alive + stale past threshold -> STALL
new_session "$ALIVE_PID"
printf '%s\n' '{"type":"message_update"}' > "$RUNDIR/result.md"
age_file "$RUNDIR/result.md" 10
assert_contains "$(bash "$POLL" "$S")" "STALL" "stale beyond threshold classifies STALL"

# 6. inside a tool call the threshold doubles: stale 8 (5 < 8 < 10) -> still ALIVE
new_session "$ALIVE_PID"
printf '%s\n%s\n' '{"type":"message_end"}' '{"type":"tool_execution_start"}' > "$RUNDIR/result.md"
age_file "$RUNDIR/result.md" 8
assert_contains "$(bash "$POLL" "$S")" "ALIVE" "quiet inside a tool call stays ALIVE up to 2x threshold"

# 7. inside a tool call but past 2x threshold -> STALL
new_session "$ALIVE_PID"
printf '%s\n' '{"type":"tool_execution_start"}' > "$RUNDIR/result.md"
age_file "$RUNDIR/result.md" 12
assert_contains "$(bash "$POLL" "$S")" "STALL" "tool-call quiet past 2x threshold is a STALL"

# 8. no events yet: alive within grace -> NO_JSONL; dead -> NO_JSONL_FAIL
new_session "$ALIVE_PID"
: > "$RUNDIR/result.md"
assert_contains "$(bash "$POLL" "$S")" "NO_JSONL" "alive with no events inside grace is NO_JSONL"
new_session "$DEAD_PID"
: > "$RUNDIR/result.md"
echo "0" > "$RUNDIR/rc"
assert_contains "$(bash "$POLL" "$S")" "NO_JSONL_FAIL" "dead with no events is NO_JSONL_FAIL"

kill "$ALIVE_PID" 2>/dev/null || true
