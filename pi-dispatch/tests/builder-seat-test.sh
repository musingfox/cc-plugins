#!/usr/bin/env bash
# builder-seat-test.sh — committed behavior test for the builder and reviewer
# seats (agents/builder.md, agents/reviewer.md).
#
#   builder tools   self-do mode holds the Edit and Write its instructions use
#   done check      the builder polls only the workers it started; no
#                   machine-wide `ls` decides when it is done
#   verdict file    the offload protocol declares a mktemp verdict file and
#                   routes on its STATUS= line; a live pi-agent.sh start with
#                   PI_WRITABLE_FILES records it, and send replays it unset
#   reviewer        no model pin (it inherits the caller's, so no pin can make
#                   it weaker than the builder) and no Edit (a judge seat)
#
# Returns 0 iff every assertion holds.

set -uo pipefail
unset PI_PROVIDER PI_MODEL PI_CONFIG_FILES PI_WRITABLE_FILES

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

AGENTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../agents" && pwd)"
SCRIPTS="$(cd "$AGENTS/../scripts" && pwd)"
BUILDER="$AGENTS/builder.md"
REVIEWER="$AGENTS/reviewer.md"

tools() { sed -n 's/^tools: //p' "$1"; }
step() { # the numbered protocol step whose first line contains $2
  awk -v m="$2" '/^[0-9]+\. /{on = index($0, m) > 0} /^$|^#/{on = 0} on' "$1"
}

B_TOOLS="$(tools "$BUILDER")"
if printf '%s\n' "$B_TOOLS" | grep -qw Edit && printf '%s\n' "$B_TOOLS" | grep -qw Write; then ok "builder tools hold Edit and Write"; else bad "builder tools -> '$B_TOOLS'"; fi

n="$(grep -c 'run `pi-agent.sh ls`' "$BUILDER")"
if [ "$n" = 0 ]; then ok "builder never runs pi-agent.sh ls as its done check"; else bad "builder 'run \`pi-agent.sh ls\`' lines -> $n"; fi
S6="$(step "$BUILDER" 'Before ending ANY turn')"
if [ -n "$S6" ] && printf '%s\n' "$S6" | grep -qF 'pi-agent.sh poll'; then ok "the before-ending step polls the builder's own workers"; else bad "before-ending step -> '$S6'"; fi

for want in mktemp PI_WRITABLE_FILES STATUS=DONE STATUS=BLOCKED; do
  if grep -qF "$want" "$BUILDER"; then ok "builder protocol names $want"; else bad "builder protocol lacks $want"; fi
done
if ! grep -qF 'produce the deliverable as your final answer text' "$BUILDER"; then ok "builder no longer takes the final answer as the verdict"; else bad "builder still asks for the deliverable as the final answer"; fi

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
export PI_BIN="$TMP/pi-stand-in"
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

n="$(grep -c '^model:' "$REVIEWER")"
if [ "$n" = 0 ]; then ok "reviewer has no model: line"; else bad "reviewer model: lines -> $n"; fi
R_TOOLS="$(tools "$REVIEWER")"
if [ -n "$R_TOOLS" ] && ! printf '%s\n' "$R_TOOLS" | grep -q Edit; then ok "reviewer tools hold no Edit"; else bad "reviewer tools -> '$R_TOOLS'"; fi

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" = 0 ]
