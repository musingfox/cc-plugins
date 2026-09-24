#!/usr/bin/env bash
# probe-watch-test.sh — committed behavior test for pi-probe.sh (gate grammar)
# and pi-watch.sh (snapshot fields). Pure-local, NO agent binary, NO network:
# probe runs against a stub command (no model call); watch runs
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

unset PI_DISPATCH_CMD PI_BIN PI_PROVIDER PI_MODEL PI_EXTRA_ARGS PI_CONFIG_FILES

# --- probe: --bin-only OK path (a guaranteed-present binary as the command) ---
got="$(PI_DISPATCH_CMD=sh bash "$PROBE" --bin-only)"; rc=$?
[ "$got" = "OK" ] && [ "$rc" -eq 0 ] && ok "probe --bin-only OK (rc=0)" || bad "probe --bin-only OK" "$got rc=$rc"
got="$(PI_DISPATCH_CMD="env A=1 sh -x" bash "$PROBE" --bin-only)"; rc=$?
[ "$got" = "OK" ] && [ "$rc" -eq 0 ] && ok "probe --bin-only looks past env and assignments to the binary" || bad "probe --bin-only env prefix" "$got rc=$rc"

# The binary is found the way bash will run it: variables expand, and a leading
# assignment or env's own options are not the binary.
mkdir -p "$TMP/home/bin"; ln -s "$(command -v sh)" "$TMP/home/bin/agent"
got="$(HOME="$TMP/home" PI_DISPATCH_CMD='$HOME/bin/agent --model x' bash "$PROBE" --bin-only)"; rc=$?
[ "$got" = "OK" ] && ok "probe --bin-only expands \$HOME in the binary path" || bad "probe \$HOME" "$got rc=$rc"
got="$(PI_DISPATCH_CMD='A=1 env C=2 sh' bash "$PROBE" --bin-only)"; rc=$?
[ "$got" = "OK" ] && ok "probe --bin-only skips a leading assignment and env" || bad "probe env prefix" "$got rc=$rc"
got="$(PI_DISPATCH_CMD='./bin/pi' bash "$PROBE" --bin-only)"; rc=$?
case "$got" in ERROR:*relative*) [ "$rc" = 1 ] && ok "probe refuses what the dispatch refuses (relative binary)" || bad "probe relative rc" "rc=$rc";; *) bad "probe relative" "$got";; esac

got="$(PI_DISPATCH_CMD='env X=$NO_SUCH_VAR_XYZ sh' bash "$PROBE" --bin-only)"; rc=$?
[ "$got" = "OK" ] && ok "probe --bin-only tolerates an unset variable, as bash -c does" || bad "probe unset var" "$got rc=$rc"

# --- probe: --bin-only NO_BIN path (missing binary, rc=1) ---
got="$(PI_DISPATCH_CMD="env A=1 definitely-not-a-binary-xyz" bash "$PROBE" --bin-only)"; rc=$?
case "$got" in NO_BIN*) [ "$rc" -eq 1 ] && ok "probe --bin-only NO_BIN (rc=1)" || bad "probe NO_BIN rc" "rc=$rc";; *) bad "probe NO_BIN" "$got";; esac

# --- probe: the full probe runs the same command a dispatch would -----------
# A probe that proves a different agent than the dispatch will use is worse
# than no probe.
PARGV="$TMP/probe-argv.log"
PSTUB="$TMP/pi-probe-stub"
cat > "$PSTUB" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$PARGV"
echo ok
EOF
chmod +x "$PSTUB"

: > "$PARGV"
PI_DISPATCH_CMD="$PSTUB --model openai-codex/gpt-5.5" bash "$PROBE" "$TMP/probe-pm" >/dev/null 2>&1
got="$(cat "$PARGV")"
case "$got" in
  "--model openai-codex/gpt-5.5 -p "*) ok "probe: the command's routing flags come first" ;;
  *) bad "probe command" "$got" ;;
esac

: > "$PARGV"
PI_DISPATCH_CMD="$PSTUB" bash "$PROBE" "$TMP/probe-none" >/dev/null 2>&1
got="$(cat "$PARGV")"
case "$got" in
  *--model*) bad "probe with nothing in the command must pass no routing flag" "$got" ;;
  "-p "*) ok "probe: a bare command passes no routing flag" ;;
  *) bad "probe bare command" "$got" ;;
esac

got="$(PI_DISPATCH_CMD="A=1 $PSTUB" bash "$PROBE" "$TMP/probe-lead")"; rc=$?
[ "$got" = "OK" ] && ok "full probe: a leading assignment still runs the agent" || bad "full probe leading assignment" "$got rc=$rc"

got="$(PI_DISPATCH_CMD="env A=1 definitely-not-a-binary-xyz" bash "$PROBE" "$TMP/probe-missing")"; rc=$?
case "$got" in NO_BIN*) [ "$rc" -eq 1 ] && ok "full probe of a missing binary -> NO_BIN" || bad "full NO_BIN rc" "rc=$rc";; *) bad "full probe NO_BIN" "$got";; esac

got="$(PI_MODEL=x PI_DISPATCH_CMD="$PSTUB" bash "$PROBE" "$TMP/probe-legacy")"; rc=$?
case "$got" in ERROR:*PI_MODEL*PI_DISPATCH_CMD*) [ "$rc" -eq 1 ] && ok "probe: a retired variable is an ERROR" || bad "legacy rc" "rc=$rc";; *) bad "probe legacy" "$got";; esac

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
