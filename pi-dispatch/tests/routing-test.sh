#!/usr/bin/env bash
# routing-test.sh — committed behavior test for pi-dispatch.sh routing: the
# --config/PI_CONFIG_FILES overlay, the PI_PROVIDER/PI_MODEL override, what actually
# reaches the binary's argv, and routing replay across a resume.
#
# Pure-local, NO omp, NO network: a stub binary records its argv.
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

# The caller's shell may already export omp's own PI_CONFIG_FILES (this repo's
# author has one per shell). Start from a clean slate so the assertions below
# measure the script, not the ambient environment.
unset PI_CONFIG_FILES PI_PROVIDER PI_MODEL PI_PROFILE

# --- resolution seam (no launch) ---------------------------------------------
export PI_RESOLVE_ROUTING_ONLY=1

got="$(bash "$DISPATCH" --config /tmp/codex.yml 2>/dev/null)"
[ "$got" = "CONFIG=/tmp/codex.yml PROVIDER= MODEL=" ] \
  && ok "--config flag resolves" || bad "--config flag" "$got"

got="$(PI_CONFIG_FILES=/tmp/grok.yml bash "$DISPATCH" dummy 2>/dev/null)"
[ "$got" = "CONFIG=/tmp/grok.yml PROVIDER= MODEL=" ] \
  && ok "PI_CONFIG_FILES env resolves" || bad "PI_CONFIG_FILES env" "$got"

got="$(PI_CONFIG_FILES=/tmp/env.yml bash "$DISPATCH" --config /tmp/flag.yml 2>/dev/null)"
[ "$got" = "CONFIG=/tmp/flag.yml PROVIDER= MODEL=" ] \
  && ok "--config flag beats PI_CONFIG_FILES env" || bad "flag vs env" "$got"

got="$(PI_PROVIDER=openai-codex PI_MODEL=gpt-5.5 bash "$DISPATCH" dummy 2>/dev/null)"
[ "$got" = "CONFIG= PROVIDER=openai-codex MODEL=gpt-5.5" ] \
  && ok "PI_PROVIDER/PI_MODEL resolve" || bad "provider/model env" "$got"

got="$(bash "$DISPATCH" dummy 2>/dev/null)"
[ "$got" = "CONFIG= PROVIDER= MODEL=" ] \
  && ok "nothing set resolves to empty (omp's own config decides)" || bad "empty routing" "$got"

> "$TMP/warn"
got="$(PI_PROFILE=stale bash "$DISPATCH" dummy 2>"$TMP/warn" >/dev/null; cat "$TMP/warn")"
case "$got" in
  *"PI_PROFILE"*"omp's isolated auth profile"*) ok "leftover PI_PROFILE warns (migration guard)" ;;
  *) bad "PI_PROFILE migration warning" "$got" ;;
esac

unset PI_RESOLVE_ROUTING_ONLY

# --- what actually reaches the binary ----------------------------------------
# The stub records its argv, then emits a session line + agent_end so pi-poll
# can reach a terminal state (needed for the resume leg below).
export ARGVLOG="$TMP/argv"
cat > "$TMP/omp" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$ARGVLOG"
echo '{"type":"session","id":"sess-stub"}'
echo '{"type":"agent_end","messages":[{"stopReason":"stop","content":[{"type":"text","text":"done"}]}]}'
EOF
chmod +x "$TMP/omp"
export PI_BIN="$TMP/omp" PI_RUNS_DIR="$TMP/runs"

launch_and_wait() { # ARGS... -> echoes RUNDIR
  local out rundir
  out="$(bash "$DISPATCH" "$@")"
  rundir="$(printf '%s\n' "$out" | sed -n 's/^RUNDIR=//p')"
  for _ in $(seq 1 50); do [ -s "$rundir/rc" ] && break; sleep 0.1; done
  printf '%s\n' "$rundir"
}

: > "$ARGVLOG"
R1="$(launch_and_wait --config "$TMP/codex.yml" "brief one")"
got="$(cat "$ARGVLOG")"
case "$got" in
  *"--config $TMP/codex.yml"*) ok "--config reaches the binary" ;;
  *) bad "--config in argv" "$got" ;;
esac
case "$got" in
  *--model*) bad "no --model when only --config given" "$got" ;;
  *) ok "no --model flag when only --config is given" ;;
esac

# --- routing is recorded ------------------------------------------------------
got="$(cat "$R1/routing" 2>/dev/null | tr '\n' ' ')"
[ "$got" = "CONFIG=$TMP/codex.yml PROVIDER= MODEL= " ] \
  && ok "routing recorded in RUNDIR" || bad "routing file" "$got"

# --- resume with no routing of its own inherits the prior run's ---------------
# This is the pin for the silent model switch: a follow-up turn used to fall back
# to the default, so a resumed session changed model mid-conversation.
: > "$ARGVLOG"
launch_and_wait "follow-up" "$PI_RUNS_DIR/pi-dispatch" "$R1" >/dev/null
got="$(cat "$ARGVLOG")"
case "$got" in
  *"--config $TMP/codex.yml"*) ok "resume inherits the prior run's routing" ;;
  *) bad "resume routing inherit" "$got" ;;
esac
case "$got" in
  *--resume*) ok "resume passes --resume" ;;
  *) bad "resume flag" "$got" ;;
esac

# --- ambient env must NOT hijack a resume ------------------------------------
# PI_CONFIG_FILES is omp's own variable, so a shell exporting grok would otherwise
# pull a session started on codex onto a different model mid-conversation.
: > "$ARGVLOG"
PI_CONFIG_FILES="$TMP/ambient.yml" \
  launch_and_wait "follow-up ambient" "$PI_RUNS_DIR/pi-dispatch" "$R1" >/dev/null
got="$(cat "$ARGVLOG")"
case "$got" in
  *"--config $TMP/codex.yml"*) ok "ambient PI_CONFIG_FILES does not hijack a resume" ;;
  *) bad "ambient env hijacked the resume" "$got" ;;
esac

# --- explicit routing on the resume still wins -------------------------------
: > "$ARGVLOG"
launch_and_wait --config "$TMP/other.yml" "follow-up 2" "$PI_RUNS_DIR/pi-dispatch" "$R1" >/dev/null
got="$(cat "$ARGVLOG")"
case "$got" in
  *"--config $TMP/other.yml"*) ok "explicit routing overrides the inherit" ;;
  *) bad "explicit routing on resume" "$got" ;;
esac

echo "---"
echo "pass: $PASS, fail: $FAIL"
[ "$FAIL" -eq 0 ]
