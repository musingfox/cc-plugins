#!/usr/bin/env bash
# poll-test.sh — committed behavior test for pi-poll.sh. Pure-local, NO pi, NO
# network, deterministic. Builds artificial fixture RUNDIRs on disk and asserts the
# EXACT STATUS= line pi-poll.sh emits for each.
#
# Terminal state source: the json event STREAM captured in result.md (pi invoked
# with --mode json). Fixtures carry the stream in result.md; sessions/ is empty.
# This matches the hybrid design where agent_end.stopReason in the stream is the
# load-bearing terminal signal — NOT sessions/*.jsonl.
#
# Cases (clean-success WHITELIST: agent_end present AND stopReason=="stop" AND
#        non-empty text):
#   (1) stream stop + non-empty text + rc=0          -> STATUS=OK ... terminal=stop
#   (2) rc=7 (abnormal-death backstop)               -> STATUS=FAIL (rc/exit)
#   (3) no rc file + dead pid + start-ts past grace  -> STATUS=FAIL ... no-rc
#   (4a) agent_end stopReason == error               -> STATUS=FAIL (ERROR)
#   (4b) result.md QUOTES "stopReason":"error" in prose but structural agent_end
#        stopReason is "stop"                        -> STATUS=OK
#        (proves we key on agent_end event, not the prose text)
#   (new-empty)   stream stop + EMPTY text + rc=0   -> STATUS=FAIL ... empty
#   (new-recover) intermediate toolUse event, agent_end stopReason==stop, rc=0,
#                 non-empty text                     -> STATUS=OK (recovered)
#   (new-aborted) agent_end stopReason==aborted      -> NOT clean OK (FAIL/not-stop)
#   (5) alive pid within thresholds                  -> RUNNING
#
# Returns 0 iff every assertion holds.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLL="$HERE/../scripts/pi-poll.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# A guaranteed-dead pid: spawn a subshell, wait for it to be reaped, reuse its pid.
# `kill -0 DEAD_PID` then reliably returns ESRCH (no such process) on this host.
dead_pid() {
  ( exit 0 ) &
  local p=$!
  wait "$p" 2>/dev/null
  echo "$p"
}

# Build a fixture RUNDIR. Args: dir, pid, start_offset_secs_ago, rc(""=none),
# result_stream (the json event stream that goes into result.md).
# sessions/ is intentionally empty — terminal state comes from the stream.
make_run() {
  local dir="$1" pid="$2" ago="$3" rc="$4" result_stream="$5"
  mkdir -p "$dir/sessions"
  printf '%s\n' "$pid" > "$dir/pi.pid"
  printf '%s\n' "$pid" > "$dir/pi.pgid"
  printf '%s\n' "$(( $(date +%s) - ago ))" > "$dir/pi-start.ts"
  printf '%s' "$result_stream" > "$dir/result.md"
  : > "$dir/pi.stderr.log"
  [ -n "$rc" ] && printf '%s\n' "$rc" > "$dir/rc"
}

# --- Canonical json event streams (one JSON object per line) ---
SESSION_LINE='{"type":"session","id":"s1"}'

# CLEAN: ends on agent_end stopReason=stop with non-empty text.
# An intermediate toolUse event before it is normal and must NOT taint the verdict.
CLEAN_STREAM="$SESSION_LINE
{\"type\":\"tool_use\",\"name\":\"bash\"}
{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"stop\",\"text\":\"the answer is 42\"}]}"

# ERROR: agent_end stopReason=error -> not a clean success.
ERROR_STREAM="$SESSION_LINE
{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"error\",\"errorMessage\":\"boom\"}]}"

# RECOVER: intermediate event with a non-stop stopReason in a different event type,
# but the agent_end (the terminal event) has stopReason=stop -> clean success.
RECOVER_STREAM="$SESSION_LINE
{\"type\":\"message\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"error\",\"errorMessage\":\"transient\"}]}
{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"stop\",\"text\":\"recovered result\"}]}"

# ABORTED: agent_end stopReason=aborted -> NOT a clean stop.
ABORTED_STREAM="$SESSION_LINE
{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"aborted\"}]}"

# NO_END: no agent_end line at all (mid-stream snapshot).
NO_END_STREAM="$SESSION_LINE
{\"type\":\"tool_use\",\"name\":\"bash\"}"

DEAD="$(dead_pid)"

# --- (1) stream stop, non-empty text, rc=0 -> STATUS=OK ---
D1="$TMP/c1"; make_run "$D1" "$DEAD" 100 "0" "$CLEAN_STREAM"
OUT="$(bash "$POLL" "$D1")"
case "$OUT" in STATUS=OK*terminal=stop*) ok "(1) stream stop -> $OUT";; *) bad "(1) expected STATUS=OK ... terminal=stop, got: $OUT";; esac

# --- (2) rc=7 -> STATUS=FAIL with rc/exit wording (abnormal-death backstop) ---
D2="$TMP/c2"; make_run "$D2" "$DEAD" 100 "7" "$CLEAN_STREAM"
OUT="$(bash "$POLL" "$D2")"
case "$OUT" in STATUS=FAIL*rc=7*) ok "(2) rc=7 -> $OUT";; *) bad "(2) expected STATUS=FAIL ... rc=7, got: $OUT";; esac

# --- (3) no rc + dead + past grace -> STATUS=FAIL ... no-rc ---
D3="$TMP/c3"; make_run "$D3" "$DEAD" 100 "" "$NO_END_STREAM"
OUT="$(PI_NO_MARKER_GRACE_S=30 bash "$POLL" "$D3")"
case "$OUT" in STATUS=FAIL*no-rc*) ok "(3) no-rc -> $OUT";; *) bad "(3) expected STATUS=FAIL ... no-rc, got: $OUT";; esac

# --- (4a) agent_end error event -> STATUS=FAIL (ERROR) ---
D4="$TMP/c4"; make_run "$D4" "$DEAD" 100 "0" "$ERROR_STREAM"
OUT="$(bash "$POLL" "$D4")"
case "$OUT" in STATUS=FAIL*ERROR*) ok "(4a) error-event -> $OUT";; *) bad "(4a) expected STATUS=FAIL ... ERROR, got: $OUT";; esac

# --- (4b) result QUOTES "stopReason":"error" in its TEXT but the structural
#         agent_end has stopReason=stop -> STATUS=OK (we key on agent_end event) ---
D5="$TMP/c5"
PROSE_STREAM="$SESSION_LINE
{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"stop\",\"text\":\"Example: a failed turn carries {\\\"stopReason\\\":\\\"error\\\",\\\"errorMessage\\\":\\\"sample\\\"}. Use errorMessage to debug.\"}]}"
make_run "$D5" "$DEAD" 100 "0" "$PROSE_STREAM"
OUT="$(bash "$POLL" "$D5")"
case "$OUT" in STATUS=OK*) ok "(4b) literal stopReason:error in prose, not a false ERROR -> $OUT";; *) bad "(4b) expected STATUS=OK, got: $OUT";; esac

# --- (new-empty) stream stop + EMPTY text + rc=0 -> must surface 'empty' ---
EMPTY_STOP_STREAM="$SESSION_LINE
{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"stop\",\"text\":\"\"}]}"
DE="$TMP/c-empty"; make_run "$DE" "$DEAD" 100 "0" "$EMPTY_STOP_STREAM"
OUT="$(bash "$POLL" "$DE")"
case "$OUT" in *empty*) ok "(new-empty) empty result surfaced -> $OUT";; *) bad "(new-empty) expected output containing 'empty', got: $OUT";; esac

# --- (new-recover) intermediate event then agent_end stopReason=stop, rc=0,
#     non-empty text -> STATUS=OK ---
DR="$TMP/c-recover"; make_run "$DR" "$DEAD" 100 "0" "$RECOVER_STREAM"
OUT="$(bash "$POLL" "$DR")"
case "$OUT" in STATUS=OK*) ok "(new-recover) recovered-then-stop -> $OUT";; *) bad "(new-recover) expected STATUS=OK, got: $OUT";; esac

# --- (new-aborted) agent_end stopReason=aborted -> NOT a clean OK (whitelist rejects) ---
DA="$TMP/c-aborted"; make_run "$DA" "$DEAD" 100 "0" "$ABORTED_STREAM"
OUT="$(bash "$POLL" "$DA")"
case "$OUT" in STATUS=FAIL*) ok "(new-aborted) aborted not a clean OK -> $OUT";; *) bad "(new-aborted) expected STATUS=FAIL (not-stop), got: $OUT";; esac

# --- (5) alive pid within thresholds -> RUNNING ---
D6="$TMP/c6"
sleep 60 & ALIVE=$!
disown 2>/dev/null || true
make_run "$D6" "$ALIVE" 5 "" "$NO_END_STREAM"
OUT="$(bash "$POLL" "$D6")"
case "$OUT" in RUNNING*) ok "(5) alive -> $OUT";; *) bad "(5) expected RUNNING, got: $OUT";; esac
kill "$ALIVE" 2>/dev/null || true

echo "---"
echo "poll-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
