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
DISPATCH="$HERE/../scripts/pi-dispatch.sh"

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
# result_stream (the json event stream that goes into result.md),
# [stream_jsonl] (optional: content for pi.stream.jsonl; omit to skip).
# sessions/ is intentionally empty — terminal state comes from the stream.
make_run() {
  local dir="$1" pid="$2" ago="$3" rc="$4" result_stream="$5" stream_jsonl="${6:-}"
  mkdir -p "$dir/sessions"
  printf '%s\n' "$pid" > "$dir/pi.pid"
  printf '%s\n' "$pid" > "$dir/pi.pgid"
  printf '%s\n' "$(( $(date +%s) - ago ))" > "$dir/pi-start.ts"
  printf '%s' "$result_stream" > "$dir/result.md"
  : > "$dir/pi.stderr.log"
  [ -n "$rc" ] && printf '%s\n' "$rc" > "$dir/rc"
  [ -n "$stream_jsonl" ] && printf '%s' "$stream_jsonl" > "$dir/pi.stream.jsonl"
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
case "$OUT" in *cause:boom*) ok "(4a-cause) FAIL line carries errorMessage cause";; *) bad "(4a-cause) expected cause:boom in: $OUT";; esac

# --- (4c) cause sanitization: '='/uppercase in errorMessage must be stripped/
#          lowercased so consumers' status-word globs (*TIMEOUT*, *exit rc=*)
#          can never false-match on the cause text ---
D4c="$TMP/c4c"
DIRTY_STREAM="$SESSION_LINE
{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"error\",\"errorMessage\":\"TIMEOUT waiting rc=9\"}]}"
make_run "$D4c" "$DEAD" 100 "0" "$DIRTY_STREAM"
OUT="$(bash "$POLL" "$D4c")"
case "$OUT" in *cause:timeout\ waiting\ rc9*) ok "(4c) cause sanitized (lowercase, '=' stripped)";; *) bad "(4c) expected sanitized cause, got: $OUT";; esac

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

# --- (new-schema) omp / pi >= 0.79 content-block message: text lives in
#     .content[] blocks, not a flat .text field -> STATUS=OK, distilled text ---
BLOCK_STREAM="$SESSION_LINE
{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"stop\",\"content\":[{\"type\":\"thinking\",\"thinking\":\"hmm\"},{\"type\":\"text\",\"text\":\"block answer\"}]}]}"
DB="$TMP/c-blocks"; make_run "$DB" "$DEAD" 100 "0" "$BLOCK_STREAM"
OUT="$(bash "$POLL" "$DB")"
if [ "${OUT#STATUS=OK}" != "$OUT" ] && grep -qx 'block answer' "$DB/result.md"; then
  ok "(new-schema) content-block text distilled -> $OUT"
else
  bad "(new-schema) expected STATUS=OK + distilled 'block answer', got: $OUT / $(cat "$DB/result.md" 2>/dev/null | head -1)"
fi

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

# ===========================================================================
# Resume coverage — exercises pi-dispatch.sh PRIOR_RUNDIR session-id extraction.
# Self-contained: embeds an argv-capture PATH-shim `omp` that records args and
# emits a canned stop stream. Does NOT source anything from .spiral/.
# Timing pins: tiny grace, huge wall/stall so nothing is flaky.
# ===========================================================================

export PI_NO_MARKER_GRACE_S=1
export PI_WALL_CLOCK_S=100000
export PI_STALL_THRESHOLD_S=100000

# argv-capture PATH-shim `omp`.
RESUME_SHIMDIR="$TMP/resume-shim"; mkdir -p "$RESUME_SHIMDIR"
RESUME_CAPTURE="$TMP/resume-pi-argv.txt"
RESUME_SESSION_LINE='{"type":"session","id":"sess-abc"}'
cat > "$RESUME_SHIMDIR/omp" <<SHIMEOF
#!/usr/bin/env bash
{ for a in "\$@"; do printf '%s\n' "\$a"; done; } >> "$RESUME_CAPTURE"
printf '%s\n' '{"type":"session","id":"sess-abc"}'
printf '%s\n' '{"type":"agent_end","messages":[{"role":"assistant","stopReason":"stop","text":"resumed"}]}'
exit 0
SHIMEOF
chmod +x "$RESUME_SHIMDIR/omp"

# Helper: reset capture, run a resume dispatch through the shim, wait for shim to
# record, return the captured argv lines. Args: prior_rundir [stderr_file].
resume_via_shim() {
  local prior="$1"
  local errfile="${2:-/dev/null}"
  local brief="$TMP/resume-brief-$RANDOM.md"; printf 'resume prompt\n' > "$brief"
  local outdir="$TMP/resume-out-$RANDOM"
  : > "$RESUME_CAPTURE"
  ( PATH="$RESUME_SHIMDIR:$PATH" bash "$DISPATCH" "$brief" "$outdir" "$prior" ) >/dev/null 2>"$errfile"
  local _
  for _ in $(seq 1 50); do [ -s "$RESUME_CAPTURE" ] && break; sleep 0.1; done
  cat "$RESUME_CAPTURE" 2>/dev/null
}

# Canonical stop stream with sess-abc as session id.
RESUME_STOP_STREAM="${RESUME_SESSION_LINE}
{\"type\":\"agent_end\",\"messages\":[{\"role\":\"assistant\",\"stopReason\":\"stop\",\"text\":\"the answer is 42\"}]}"

# --- (resume-1) distilled round-trip: make_run with stop stream → poll to OK
#     (pi.stream.jsonl written by poll, result.md distilled) → resume recovers sess-abc ---
DR1="$TMP/resume-c1"
make_run "$DR1" "$DEAD" 100 "0" "$RESUME_STOP_STREAM"
# Distill: run pi-poll.sh to terminal OK (writes pi.stream.jsonl, rewrites result.md).
bash "$POLL" "$DR1" >/dev/null 2>/dev/null || true
# After distill, pi.stream.jsonl holds the raw stream; result.md is human prose.
CAP_R1="$(resume_via_shim "$DR1")"
r1_ok=0
printf '%s\n' "$CAP_R1" | grep -qx -- '--resume' && \
  printf '%s\n' "$CAP_R1" | grep -qx 'sess-abc' && r1_ok=1
if [ "$r1_ok" -eq 1 ]; then
  ok "(resume-1) distilled round-trip: --resume sess-abc recovered from pi.stream.jsonl"
else
  bad "(resume-1) distilled round-trip: expected --resume sess-abc; argv: $(printf '%s ' $CAP_R1)"
fi

# --- (resume-2) result.md fallback: raw-stream result.md, no pi.stream.jsonl
#     → resume recovers sess-abc from result.md ---
DR2="$TMP/resume-c2"
make_run "$DR2" "$DEAD" 100 "0" "$RESUME_STOP_STREAM"
# Ensure no pi.stream.jsonl exists (make_run only writes it when arg 6 is non-empty).
CAP_R2="$(resume_via_shim "$DR2")"
r2_ok=0
printf '%s\n' "$CAP_R2" | grep -qx -- '--resume' && \
  printf '%s\n' "$CAP_R2" | grep -qx 'sess-abc' && r2_ok=1
if [ "$r2_ok" -eq 1 ]; then
  ok "(resume-2) result.md fallback: --resume sess-abc recovered from result.md"
else
  bad "(resume-2) result.md fallback: expected --resume sess-abc; argv: $(printf '%s ' $CAP_R2)"
fi

# --- (resume-3) whole-stream: pi.stream.jsonl line 1 is non-session, session on line 2
#     → resume still recovers sess-abc ---
DR3="$TMP/resume-c3"
NONSES_STREAM='{"type":"message","role":"assistant"}
'"$RESUME_SESSION_LINE"'
{"type":"agent_end","messages":[{"role":"assistant","stopReason":"stop","text":"done"}]}'
make_run "$DR3" "$DEAD" 100 "0" "the answer is 42" "$NONSES_STREAM"
CAP_R3="$(resume_via_shim "$DR3")"
r3_ok=0
printf '%s\n' "$CAP_R3" | grep -qx -- '--resume' && \
  printf '%s\n' "$CAP_R3" | grep -qx 'sess-abc' && r3_ok=1
if [ "$r3_ok" -eq 1 ]; then
  ok "(resume-3) whole-stream: --resume sess-abc recovered when session NOT on line 1"
else
  bad "(resume-3) whole-stream: expected --resume sess-abc; argv: $(printf '%s ' $CAP_R3)"
fi

# --- (resume-4) warn+fresh: truncated result.md fragment, no pi.stream.jsonl
#     → NO --session in argv AND stderr names the prior rundir ---
DR4="$TMP/resume-c4"
mkdir -p "$DR4/sessions"
printf '%s\n' "$DEAD" > "$DR4/pi.pid"
printf '%s\n' "$DEAD" > "$DR4/pi.pgid"
printf '%s\n' "$(( $(date +%s) - 100 ))" > "$DR4/pi-start.ts"
: > "$DR4/pi.stderr.log"
printf '%s\n' "0" > "$DR4/rc"
printf '%s' '{"type":"agent_en' > "$DR4/result.md"   # truncated, no session id
ERR_R4="$TMP/resume-c4-stderr"
CAP_R4="$(resume_via_shim "$DR4" "$ERR_R4")"
r4_fresh=0; r4_warn=0
# (a) proceeded fresh: shim was called (argv captured) but WITHOUT --session
if [ -s "$RESUME_CAPTURE" ] && ! printf '%s\n' "$CAP_R4" | grep -qx -- '--resume'; then
  r4_fresh=1
fi
# (b) stderr warning names the prior rundir
if [ -s "$ERR_R4" ] && grep -qF "$DR4" "$ERR_R4"; then
  r4_warn=1
fi
if [ "$r4_fresh" -eq 1 ] && [ "$r4_warn" -eq 1 ]; then
  ok "(resume-4) warn+fresh: no --resume AND stderr names prior rundir"
else
  bad "(resume-4) warn+fresh: fresh($r4_fresh) AND warn($r4_warn) both required; argv: $(printf '%s ' $CAP_R4) stderr: $(cat "$ERR_R4" 2>/dev/null | tr '\n' ' ')"
fi

echo "---"
echo "poll-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
