#!/usr/bin/env bash
# poll-test.sh — committed behavior test for pi-poll.sh. Pure-local, NO pi, NO
# network, deterministic. Builds artificial fixture RUNDIRs on disk and asserts the
# EXACT STATUS= line pi-poll.sh emits for each.
#
# Cases:
#   (1) rc=0 + non-empty result + no error event            -> STATUS=OK
#   (2) rc=7                                                 -> STATUS=FAIL (rc/exit)
#   (3) no rc file + dead pid + start-ts past grace          -> STATUS=FAIL ... no-rc
#   (4a) jsonl carries an error EVENT ("stopReason":"error") -> STATUS=FAIL (ERROR)
#   (4b) result.md merely QUOTES "errorMessage" but jsonl is clean -> STATUS=OK
#        (proves we key on the error EVENT, not free-answer prose)
#   (5) alive pid within thresholds                          -> RUNNING
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
# result_text, jsonl_body.
make_run() {
  local dir="$1" pid="$2" ago="$3" rc="$4" result="$5" jsonl="$6"
  mkdir -p "$dir/sessions"
  printf '%s\n' "$pid" > "$dir/pi.pid"
  printf '%s\n' "$pid" > "$dir/pi.pgid"
  printf '%s\n' "$(( $(date +%s) - ago ))" > "$dir/pi-start.ts"
  printf '%s' "$result" > "$dir/result.md"
  : > "$dir/pi.stderr.log"
  [ -n "$rc" ] && printf '%s\n' "$rc" > "$dir/rc"
  if [ -n "$jsonl" ]; then printf '%s\n' "$jsonl" > "$dir/sessions/run.jsonl"; fi
}

CLEAN_JSONL='{"type":"session","id":"s1"}
{"type":"message","message":{"role":"assistant","stopReason":"end_turn"}}'

ERROR_JSONL='{"type":"session","id":"s1"}
{"type":"message","message":{"role":"assistant","stopReason":"error","errorMessage":"boom"}}'

DEAD="$(dead_pid)"

# --- (1) rc=0, non-empty result, clean jsonl -> STATUS=OK ---
D1="$TMP/c1"; make_run "$D1" "$DEAD" 100 "0" "the answer is 42" "$CLEAN_JSONL"
OUT="$(bash "$POLL" "$D1")"
case "$OUT" in STATUS=OK*) ok "(1) rc=0 -> $OUT";; *) bad "(1) expected STATUS=OK, got: $OUT";; esac

# --- (2) rc=7 -> STATUS=FAIL with rc/exit wording ---
D2="$TMP/c2"; make_run "$D2" "$DEAD" 100 "7" "partial" "$CLEAN_JSONL"
OUT="$(bash "$POLL" "$D2")"
case "$OUT" in STATUS=FAIL*rc=7*) ok "(2) rc=7 -> $OUT";; *) bad "(2) expected STATUS=FAIL ... rc=7, got: $OUT";; esac

# --- (3) no rc + dead + past grace -> STATUS=FAIL ... no-rc ---
D3="$TMP/c3"; make_run "$D3" "$DEAD" 100 "" "" "$CLEAN_JSONL"
OUT="$(PI_NO_MARKER_GRACE_S=30 bash "$POLL" "$D3")"
case "$OUT" in STATUS=FAIL*no-rc*) ok "(3) no-rc -> $OUT";; *) bad "(3) expected STATUS=FAIL ... no-rc, got: $OUT";; esac

# --- (4a) error EVENT in jsonl -> STATUS=FAIL (ERROR) ---
D4="$TMP/c4"; make_run "$D4" "$DEAD" 100 "0" "looks fine" "$ERROR_JSONL"
OUT="$(bash "$POLL" "$D4")"
case "$OUT" in STATUS=FAIL*ERROR*) ok "(4a) error-event -> $OUT";; *) bad "(4a) expected STATUS=FAIL ... ERROR, got: $OUT";; esac

# --- (4b) result QUOTES errorMessage but jsonl clean -> STATUS=OK (no false ERROR) ---
D5="$TMP/c5"
make_run "$D5" "$DEAD" 100 "0" 'Here is a JSON example: {"errorMessage":"sample"} — use errorMessage for failures.' "$CLEAN_JSONL"
OUT="$(bash "$POLL" "$D5")"
case "$OUT" in STATUS=OK*) ok "(4b) prose errorMessage not a false ERROR -> $OUT";; *) bad "(4b) expected STATUS=OK, got: $OUT";; esac

# --- (5) alive pid within thresholds -> RUNNING ---
D6="$TMP/c6"
sleep 60 & ALIVE=$!
disown 2>/dev/null || true
make_run "$D6" "$ALIVE" 5 "" "working..." "$CLEAN_JSONL"
OUT="$(bash "$POLL" "$D6")"
case "$OUT" in RUNNING*) ok "(5) alive -> $OUT";; *) bad "(5) expected RUNNING, got: $OUT";; esac
kill "$ALIVE" 2>/dev/null || true

echo "---"
echo "poll-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
