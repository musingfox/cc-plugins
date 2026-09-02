#!/usr/bin/env bash
# routing-test.sh — committed behavior test for pi-dispatch.sh routing: the
# PI_PROVIDER/PI_MODEL env, what actually reaches the binary's argv, and routing
# replay across a resume.
#
# Pure-local, NO pi, NO network: a stub binary records its argv.
#
# Returns 0 iff every assertion holds.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH="$SCRIPT_DIR/../scripts/pi-dispatch.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1 (got: $2)"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Start from a clean slate so the assertions measure the script, not the
# ambient environment.
unset PI_PROVIDER PI_MODEL PI_CONFIG_FILES

# --- resolution seam (no launch) ---------------------------------------------
export PI_RESOLVE_ROUTING_ONLY=1

got="$(PI_PROVIDER=openai-codex PI_MODEL=gpt-5.5 bash "$DISPATCH" dummy 2>/dev/null)"
[ "$got" = "PROVIDER=openai-codex MODEL=gpt-5.5" ] \
  && ok "PI_PROVIDER/PI_MODEL resolve" || bad "provider/model env" "$got"

got="$(bash "$DISPATCH" dummy 2>/dev/null)"
[ "$got" = "PROVIDER= MODEL=" ] \
  && ok "nothing set resolves to empty (pi's own settings decide)" || bad "empty routing" "$got"

got="$(PI_CONFIG_FILES=/tmp/stale.yml bash "$DISPATCH" dummy 2>&1 >/dev/null)"
case "$got" in
  *"PI_CONFIG_FILES is ignored"*) ok "leftover PI_CONFIG_FILES warns (omp migration guard)" ;;
  *) bad "PI_CONFIG_FILES migration warning" "$got" ;;
esac

unset PI_RESOLVE_ROUTING_ONLY

# --- what actually reaches the binary ----------------------------------------
# The stub records its argv, then emits a session line + agent_end so pi-poll
# can reach a terminal state (needed for the resume leg below).
export ARGVLOG="$TMP/argv"
cat > "$TMP/pi" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$ARGVLOG"
echo '{"type":"session","id":"sess-stub"}'
echo '{"type":"agent_end","messages":[{"stopReason":"stop","content":[{"type":"text","text":"done"}]}]}'
EOF
chmod +x "$TMP/pi"
export PI_BIN="$TMP/pi" PI_RUNS_DIR="$TMP/runs"

launch_and_wait() { # ARGS... -> echoes RUNDIR
  local out rundir
  out="$(bash "$DISPATCH" "$@")"
  rundir="$(printf '%s\n' "$out" | sed -n 's/^RUNDIR=//p')"
  for _ in $(seq 1 50); do [ -s "$rundir/rc" ] && break; sleep 0.1; done
  printf '%s\n' "$rundir"
}

: > "$ARGVLOG"
R0="$(launch_and_wait "brief zero")"
got="$(cat "$ARGVLOG")"
case "$got" in
  *--model*) bad "no --model when nothing is set" "$got" ;;
  *) ok "no --model flag when nothing is set" ;;
esac
case "$got" in
  *--session\ *|*--resume*) bad "fresh dispatch must not pass a session id" "$got" ;;
  *) ok "fresh dispatch passes no session id" ;;
esac

: > "$ARGVLOG"
R1="$(PI_PROVIDER=openai-codex PI_MODEL=gpt-5.5 launch_and_wait "brief one")"
got="$(cat "$ARGVLOG")"
case "$got" in
  *"--model openai-codex/gpt-5.5"*) ok "PROVIDER/MODEL reaches the binary as --model provider/model" ;;
  *) bad "--model in argv" "$got" ;;
esac

# --- routing is recorded ------------------------------------------------------
got="$(cat "$R1/routing" 2>/dev/null | tr '\n' ' ')"
[ "$got" = "PROVIDER=openai-codex MODEL=gpt-5.5 " ] \
  && ok "routing recorded in RUNDIR" || bad "routing file" "$got"

# --- resume inherits the prior run's routing; the env must NOT hijack it ------
# This is the pin for the silent model switch: a follow-up turn used to fall back
# to the default, so a resumed session changed model mid-conversation.
: > "$ARGVLOG"
PI_PROVIDER=xai-auth PI_MODEL=grok-build \
  launch_and_wait "follow-up" "$PI_RUNS_DIR/pi-dispatch" "$R1" >/dev/null
got="$(cat "$ARGVLOG")"
case "$got" in
  *"--model openai-codex/gpt-5.5"*) ok "resume inherits the prior run's routing over the env" ;;
  *) bad "resume routing inherit" "$got" ;;
esac
case "$got" in
  *"--session sess-stub"*) ok "resume passes --session <id> (not --resume, pi's interactive picker)" ;;
  *) bad "resume flag" "$got" ;;
esac
case "$got" in
  *"--session-dir $R1/sessions"*) ok "resume points --session-dir at the PRIOR run's sessions" ;;
  *) bad "resume session-dir" "$got" ;;
esac

echo "---"
echo "pass: $PASS, fail: $FAIL"
[ "$FAIL" -eq 0 ]
