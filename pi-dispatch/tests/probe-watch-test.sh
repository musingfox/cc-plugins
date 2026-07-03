#!/usr/bin/env bash
# probe-watch-test.sh — committed behavior test for pi-probe.sh (gate grammar)
# and pi-watch.sh (snapshot fields). Pure-local, NO agent binary, NO network:
# probe is exercised only via --bin-only / NO_BIN (no model call); watch runs
# on fixture streams, including a partial trailing line (live mid-write).

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE="$HERE/../scripts/pi-probe.sh"
WATCH="$HERE/../scripts/pi-watch.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1 (got: $2)"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- probe: --bin-only OK path (use a guaranteed-present binary as PI_BIN) ---
got="$(PI_BIN=sh bash "$PROBE" --bin-only)"; rc=$?
[ "$got" = "OK" ] && [ "$rc" -eq 0 ] && ok "probe --bin-only OK (rc=0)" || bad "probe --bin-only OK" "$got rc=$rc"

# --- probe: --bin-only NO_BIN path (missing binary, rc=1) ---
got="$(PI_BIN=definitely-not-a-binary-xyz bash "$PROBE" --bin-only)"; rc=$?
case "$got" in NO_BIN*) [ "$rc" -eq 1 ] && ok "probe --bin-only NO_BIN (rc=1)" || bad "probe NO_BIN rc" "rc=$rc";; *) bad "probe NO_BIN" "$got";; esac

# --- watch: fixture stream with tools, usage, text, and a PARTIAL trailing line ---
D="$TMP/run-w1"; mkdir -p "$D"
printf '%s\n' "$(( $(date +%s) - 42 ))" > "$D/pi-start.ts"
cat > "$D/result.md" <<'EOF'
{"type":"session","id":"s1"}
{"type":"tool_execution_start","toolName":"bash"}
{"type":"tool_execution_end","toolName":"bash"}
{"type":"message_end","message":{"role":"assistant","usage":{"totalTokens":1200,"output":50},"content":[{"type":"text","text":"working on it"}]}}
{"type":"tool_execution_start","toolName":"write"}
EOF
printf '%s' '{"type":"tool_execution_end","toolNa' >> "$D/result.md"   # mid-write partial line
out="$(bash "$WATCH" "$D")"
echo "$out" | grep -q 'EVENTS=5' && echo "$out" | grep -q 'TERMINAL=no' \
  && ok "watch: partial trailing line skipped, 5 events, non-terminal" \
  || bad "watch events/terminal" "$out"
echo "$out" | grep -q 'TOOLS done=1/2 last=write' && ok "watch: tool counts + last tool" || bad "watch tools" "$out"
echo "$out" | grep -q 'TOKENS ctx=1200 out=50' && ok "watch: token usage" || bad "watch tokens" "$out"
echo "$out" | grep -q 'TEXT working on it' && ok "watch: latest assistant text" || bad "watch text" "$out"

# --- watch: prefers pi.stream.jsonl after distill (result.md is prose) ---
D2="$TMP/run-w2"; mkdir -p "$D2"
printf '%s\n' "$(( $(date +%s) - 10 ))" > "$D2/pi-start.ts"
printf '%s\n' "distilled prose result" > "$D2/result.md"
cat > "$D2/pi.stream.jsonl" <<'EOF'
{"type":"session","id":"s2"}
{"type":"agent_end","messages":[{"role":"assistant","stopReason":"stop","content":[{"type":"text","text":"final answer"}]}]}
EOF
out="$(bash "$WATCH" "$D2")"
echo "$out" | grep -q 'TERMINAL=yes' && ok "watch: distilled run reads pi.stream.jsonl (terminal)" || bad "watch distilled" "$out"

echo "---"
echo "probe-watch-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
