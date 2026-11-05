#!/usr/bin/env bash
# reviewer-seat-test.sh — committed behavior test for the reviewer seat
# (agents/reviewer.md) and the verdict file a dispatch declares.
#
#   verdict file    a live pi-agent.sh start with PI_WRITABLE_FILES records
#                   the verdict path, and send replays it unset
#   reviewer        pinned on opus and no Edit (a judge seat)
#
# Returns 0 iff every assertion holds.

set -uo pipefail
unset PI_BIN PI_PROVIDER PI_MODEL PI_EXTRA_ARGS PI_CONFIG_FILES PI_WRITABLE_FILES

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

AGENTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../agents" && pwd)"
SCRIPTS="$(cd "$AGENTS/../scripts" && pwd)"
REVIEWER="$AGENTS/reviewer.md"

tools() { sed -n 's/^tools: //p' "$1"; }

# --- live start/send: the declared verdict file is recorded and replayed ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export PI_RUNS_DIR="$TMP/runs"
export PI_CWD="$TMP/work"; mkdir -p "$PI_CWD"
cat > "$TMP/pi-stand-in" <<'STANDIN'
#!/usr/bin/env bash
echo '{"type":"session","id":"sess-stand-in"}'
printf 'WRITABLE_ENV=%s\n' "${PI_WRITABLE_FILES-<unset>}"
echo '{"type":"agent_end","messages":[{"stopReason":"stop","content":[{"type":"text","text":"done"}]}]}'
STANDIN
chmod +x "$TMP/pi-stand-in"
export PI_DISPATCH_CMD="$TMP/pi-stand-in"
printf 'do nothing\n' > "$TMP/brief.md"
printf 'and once more\n' > "$TMP/more.md"

settle() { # NAME -> 0 once poll reports a terminal STATUS=
  for _ in $(seq 1 50); do
    case "$("$SCRIPTS/pi-agent.sh" poll "$1" 2>/dev/null)" in STATUS=*) return 0 ;; esac
    sleep 0.2
  done
  return 1
}
rundir() { readlink "$PI_RUNS_DIR/agents/$1"; }
rec() { sed -n 's/^WRITABLE=//p' "$1/routing"; }
env_seen() { sed -n 's/^WRITABLE_ENV=//p' "$1/pi.stream.jsonl"; }

VERDICT="$(mktemp)"
VERDICT_C="$(cd "$(dirname "$VERDICT")" && pwd -P)/$(basename "$VERDICT")"
PI_WRITABLE_FILES="$VERDICT" "$SCRIPTS/pi-agent.sh" start v1 "$TMP/brief.md" >/dev/null 2>"$TMP/err"
R1="$(rundir v1)"
if [ -n "$R1" ] && [ "$(rec "$R1")" = "$VERDICT_C" ]; then ok "start -> routing records the canonical verdict path"; else bad "start -> R1='$R1' rec='$(rec "$R1" 2>/dev/null)' want '$VERDICT_C' err=$(cat "$TMP/err")"; fi
settle v1 || bad "start -> v1 never reached a terminal poll"
if [ "$(env_seen "$R1")" = "$VERDICT_C" ]; then ok "start -> the worker's env holds the verdict path"; else bad "start -> worker env '$(env_seen "$R1")'"; fi

"$SCRIPTS/pi-agent.sh" send v1 "$TMP/more.md" >/dev/null 2>"$TMP/err"
R2="$(rundir v1)"
settle v1 || bad "send -> v1 never reached a terminal poll"
if [ -n "$R2" ] && [ "$R2" != "$R1" ] && [ "$(rec "$R2")" = "$VERDICT_C" ]; then ok "send with the env unset -> the new routing replays the verdict path"; else bad "send -> R2='$R2' rec='$(rec "$R2" 2>/dev/null)' err=$(cat "$TMP/err")"; fi
if [ "$(env_seen "$R2")" = "$VERDICT_C" ]; then ok "send -> the resumed worker's env holds the verdict path"; else bad "send -> worker env '$(env_seen "$R2")'"; fi
rm -f "$VERDICT"

# 7c5d7e0 pins the reviewer on opus so it is never weaker than the seat that built the deliverable.
n="$(grep -c '^model:' "$REVIEWER")"
if [ "$n" = 1 ] && grep -qx 'model: opus' "$REVIEWER"; then ok "reviewer pins model: opus"; else bad "reviewer model: lines -> $n, opus pin -> $(grep -c '^model: opus$' "$REVIEWER")"; fi
R_TOOLS="$(tools "$REVIEWER")"
if [ -n "$R_TOOLS" ] && ! printf '%s\n' "$R_TOOLS" | grep -q Edit; then ok "reviewer tools hold no Edit"; else bad "reviewer tools -> '$R_TOOLS'"; fi

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" = 0 ]
