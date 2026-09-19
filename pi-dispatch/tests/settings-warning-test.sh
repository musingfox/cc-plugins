#!/usr/bin/env bash
# settings-warning-test.sh — committed behavior test for the missing-settings warning.
# Pure-local, NO pi, NO network: PI_BIN is a stand-in that exits at once.
#
#   no routing pinned and <agent dir>/settings.json missing -> one stderr warning
#     naming that file; exit 0; stdout unchanged
#   settings.json present, PI_MODEL set, a resume whose record pins a model,
#     or PI_RESOLVE_ROUTING_ONLY=1 -> no warning
#
# Returns 0 iff every assertion holds.

set -uo pipefail

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   - $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH="$SCRIPT_DIR/../scripts/pi-dispatch.sh"

unset PI_PROVIDER PI_MODEL PI_CONFIG_FILES PI_WRITABLE_FILES PI_CODING_AGENT_DIR PI_RESOLVE_ROUTING_ONLY

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
TMP="$(cd "$TMP" && pwd -P)"

SHIM="$TMP/pi-shim"
printf '#!/usr/bin/env bash\nexit 0\n' > "$SHIM"
chmod +x "$SHIM"

WORK="$TMP/work"; OUT="$TMP/runs"; AGENT="$TMP/agent"; HOME2="$TMP/home2"
mkdir -p "$WORK" "$OUT" "$AGENT" "$HOME2"

dispatch() { # usage: dispatch <env assignments...>; stdout -> $TMP/out, stderr -> $TMP/err
  env PI_BIN="$SHIM" PI_CWD="$WORK" "$@" "$DISPATCH" "do nothing" "$OUT" >"$TMP/out" 2>"$TMP/err"
}
wait_rc() { local rd; rd="$(sed -n 's/^RUNDIR=//p' "$TMP/out")"; for _ in $(seq 1 50); do [ -s "$rd/rc" ] && break; sleep 0.1; done; }

# --- missing settings.json under PI_CODING_AGENT_DIR ---
dispatch PI_CODING_AGENT_DIR="$AGENT"; rc=$?; wait_rc
if [ "$rc" = 0 ] && grep -qF "$AGENT/settings.json" "$TMP/err"; then ok "missing settings -> stderr names $AGENT/settings.json, exit 0"; else bad "missing settings -> rc=$rc err=$(cat "$TMP/err")"; fi
if [ "$(wc -l < "$TMP/out" | tr -d ' ')" = 4 ] && [ "$(cut -d= -f1 "$TMP/out" | tr '\n' ' ')" = "ROUTING OUTPUT PID RUNDIR " ]; then ok "missing settings -> stdout is exactly the four handle lines"; else bad "stdout -> $(cat "$TMP/out")"; fi

# --- settings.json present ---
printf '{}\n' > "$AGENT/settings.json"
dispatch PI_CODING_AGENT_DIR="$AGENT"; wait_rc
if ! grep -q 'no routing pinned' "$TMP/err"; then ok "settings present -> no warning"; else bad "settings present -> $(cat "$TMP/err")"; fi
rm -f "$AGENT/settings.json"

# --- a pinned model ---
dispatch PI_CODING_AGENT_DIR="$AGENT" PI_MODEL=m; wait_rc
if ! grep -q 'no routing pinned' "$TMP/err"; then ok "PI_MODEL set -> no warning"; else bad "PI_MODEL -> $(cat "$TMP/err")"; fi

# --- PI_CODING_AGENT_DIR unset -> $HOME/.pi/agent ---
env -u PI_CODING_AGENT_DIR PI_BIN="$SHIM" PI_CWD="$WORK" HOME="$HOME2" "$DISPATCH" "do nothing" "$OUT" >"$TMP/out" 2>"$TMP/err"; wait_rc
if grep -qF "$HOME2/.pi/agent/settings.json" "$TMP/err"; then ok "agent dir unset -> warning names \$HOME/.pi/agent/settings.json"; else bad "HOME default -> $(cat "$TMP/err")"; fi

# --- a resume whose record pins a model ---
PRIOR="$TMP/prior"; mkdir -p "$PRIOR"
printf 'PROVIDER=\nMODEL=m\nCWD=%s\nWRITABLE=\n' "$WORK" > "$PRIOR/routing"
env PI_BIN="$SHIM" PI_CODING_AGENT_DIR="$AGENT" "$DISPATCH" "do nothing" "$OUT" "$PRIOR" >"$TMP/out" 2>"$TMP/err"; wait_rc
if grep -q '^RUNDIR=' "$TMP/out" && ! grep -q 'no routing pinned' "$TMP/err"; then ok "resume of a model-pinned record -> no warning"; else bad "resume -> $(cat "$TMP/err")"; fi

# --- routing introspection never warns ---
env PI_RESOLVE_ROUTING_ONLY=1 PI_CODING_AGENT_DIR="$AGENT" "$DISPATCH" dummy >"$TMP/out" 2>"$TMP/err"
if ! grep -q 'no routing pinned' "$TMP/err"; then ok "PI_RESOLVE_ROUTING_ONLY=1 -> no warning"; else bad "resolve-only -> $(cat "$TMP/err")"; fi

# --- the comments describe what the runtime does ---
FENCE="$SCRIPT_DIR/../extensions/worktree-fence.ts"
[ "$(grep -c 'config\.yml' "$DISPATCH")" = 0 ] && ok "pi-dispatch.sh never names config.yml" || bad "config.yml still in pi-dispatch.sh"
[ "$(grep -ci overlay "$DISPATCH")" = 0 ] && ok "pi-dispatch.sh never says overlay" || bad "overlay still in pi-dispatch.sh"
bash "$SCRIPT_DIR/routing-test.sh" >/dev/null 2>&1 && ok "routing-test.sh passes (PI_CONFIG_FILES is ignored still pinned)" || bad "routing-test.sh fails"
[ "$(grep -c 'whenever PI_CWD is set' "$FENCE")" = 0 ] && ok "fence header no longer says it loads only with PI_CWD" || bad "stale fence header"
[ "$(sed -n '1,/^[^#]/p' "$DISPATCH" | grep '^#' | grep -c PI_WRITABLE_FILES)" -ge 1 ] && ok "pi-dispatch.sh header documents PI_WRITABLE_FILES" || bad "PI_WRITABLE_FILES missing from the header"

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
