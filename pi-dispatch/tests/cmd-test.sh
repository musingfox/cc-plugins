#!/usr/bin/env bash
# cmd-test.sh — committed behavior test for PI_DISPATCH_CMD, the one routing knob:
# what reaches the agent, how it is recorded and replayed on a resume, and the
# refusal of the variables it replaced.
#
# Pure-local, NO pi, NO network: a stub binary records its argv and environment.
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
TMP="$(cd "$TMP" && pwd -P)"

# Start from a clean slate so the assertions measure the script, not the
# ambient environment.
unset PI_DISPATCH_CMD PI_BIN PI_PROVIDER PI_MODEL PI_EXTRA_ARGS PI_CONFIG_FILES PI_WRITABLE_FILES

# The stub records its argv and one env var, then emits a session line +
# agent_end so pi-poll can reach a terminal state.
export ARGVLOG="$TMP/argv" ENVLOG="$TMP/env"
mkdir -p "$TMP/bin"
cat > "$TMP/bin/pi" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$ARGVLOG"
echo "STUB_VAR=${STUB_VAR:-}" >> "$ENVLOG"
echo '{"type":"session","id":"sess-stub"}'
echo '{"type":"agent_end","messages":[{"stopReason":"stop","content":[{"type":"text","text":"done"}]}]}'
EOF
chmod +x "$TMP/bin/pi"
export PI_RUNS_DIR="$TMP/runs"
export PI_CWD="$TMP/work"; mkdir -p "$PI_CWD"

launch() { # ARGS... -> stdout of the launch in $TMP/out, echoes RUNDIR once rc lands
  local rundir
  bash "$DISPATCH" "$@" > "$TMP/out" 2> "$TMP/err"
  rundir="$(sed -n 's/^RUNDIR=//p' "$TMP/out")"
  for _ in $(seq 1 50); do [ -s "$rundir/rc" ] && break; sleep 0.1; done
  printf '%s\n' "$rundir"
}
reset_logs() { : > "$ARGVLOG"; : > "$ENVLOG"; }

# --- unset: refused, never a guessed default ----------------------------------
# The caller must choose the agent and model; the refusal names the variable
# so main can ask the human and set it.
before="$(ls "$PI_RUNS_DIR/pi-dispatch" 2>/dev/null | wc -l | tr -d ' ')"
PATH="$TMP/bin:$PATH" bash "$DISPATCH" "brief zero" > /dev/null 2> "$TMP/err"; rc=$?
after="$(ls "$PI_RUNS_DIR/pi-dispatch" 2>/dev/null | wc -l | tr -d ' ')"
if [ "$rc" = 2 ] && grep -q 'PI_DISPATCH_CMD is not set' "$TMP/err" && [ ! -s "$ARGVLOG" ] && [ "$before" = "$after" ]; then
  ok "unset PI_DISPATCH_CMD exits 2 naming it, launches nothing, leaves no run dir"
else
  bad "unset refusal" "rc=$rc $(cat "$TMP/err")"
fi
PI_DISPATCH_CMD= PI_DISPATCH_CHECK=1 bash "$DISPATCH" > /dev/null 2> "$TMP/err"; rc=$?
[ "$rc" = 2 ] && grep -q 'PI_DISPATCH_CMD is not set' "$TMP/err" && ok "the check seam refuses an empty command too" || bad "check seam unset" "rc=$rc"

reset_logs
R0="$(PI_DISPATCH_CMD=pi PATH="$TMP/bin:$PATH" launch "brief zero")"
got="$(cat "$ARGVLOG")"
case "$got" in
  "-p --mode json "*) ok "PI_DISPATCH_CMD=pi runs pi from PATH with the dispatch flags" ;;
  *) bad "bare pi command" "$got" ;;
esac
case "$got" in
  *--session\ *) bad "fresh dispatch must not pass a session id" "$got" ;;
  *) ok "fresh dispatch passes no session id" ;;
esac
grep -qx 'CMD=pi' "$R0/routing" && ok "the command is recorded as CMD=pi" || bad "record" "$(tr '\n' ' ' < "$R0/routing")"

# --- a full prefix: env assignment, binary path, routing flags --------------
reset_logs
export PI_DISPATCH_CMD="env STUB_VAR=from-cmd $TMP/bin/pi --model prov/model-x"
R1="$(launch "brief one")"
got="$(cat "$ARGVLOG")"
case "$got" in
  "--model prov/model-x -p --mode json "*) ok "the command's own flags come first, then the dispatch flags" ;;
  *) bad "prefix argv" "$got" ;;
esac
grep -qx 'STUB_VAR=from-cmd' "$ENVLOG" && ok "an env assignment in the command reaches the agent" || bad "env prefix" "$(cat "$ENVLOG")"
grep -qx "CMD=$PI_DISPATCH_CMD" "$R1/routing" && ok "the command is recorded verbatim" || bad "record" "$(tr '\n' ' ' < "$R1/routing")"
got="$(sed -n 's/^CMD=//p' "$TMP/out")"
[ "$got" = "$PI_DISPATCH_CMD" ] && ok "the launch prints the command on its own CMD= line" || bad "CMD line" "$got"

# --- a leading assignment is an env var, not the command name ---------------
reset_logs
PI_DISPATCH_CMD="STUB_VAR=leading $TMP/bin/pi" launch "brief leading" >/dev/null
grep -qx 'STUB_VAR=leading' "$ENVLOG" && ok "a leading VAR=value reaches the agent as env" || bad "leading assignment" "$(cat "$ENVLOG") $(cat "$TMP/err")"

# --- shell words expand: a tilde after = ------------------------------------
reset_logs
HOME="$TMP" PI_DISPATCH_CMD="env STUB_VAR=~/agent $TMP/bin/pi" launch "brief tilde" >/dev/null
grep -qx "STUB_VAR=$TMP/agent" "$ENVLOG" && ok "a tilde in the command expands like in a shell" || bad "tilde" "$(cat "$ENVLOG")"

# --- a newline cannot enter the line-based record ---------------------------
before="$(ls "$PI_RUNS_DIR/pi-dispatch" | wc -l | tr -d ' ')"
PI_DISPATCH_CMD="$TMP/bin/pi
--model x" bash "$DISPATCH" "brief nl" > /dev/null 2> "$TMP/err"; rc=$?
[ "$rc" = "2" ] && ok "a command with a newline exits 2" || bad "newline rc" "rc=$rc $(cat "$TMP/err")"
after="$(ls "$PI_RUNS_DIR/pi-dispatch" | wc -l | tr -d ' ')"
[ "$before" = "$after" ] && ok "the refusal leaves no run dir behind" || bad "run dir created" "$before -> $after"

# --- a shell operator would cut the dispatch's own flags off ----------------
# `# ...` comments out "$@", `;` or `&` ends the command before it: the agent
# would start without -p, the brief or the fence extension.
for bad in "$TMP/bin/pi --model x # note" "$TMP/bin/pi --model x;" "$TMP/bin/pi --model x &" "$TMP/bin/pi | tee log" "$TMP/bin/pi > log" \
           "$TMP/bin/pi --model x)" "$TMP/bin/pi \`id\`" "$TMP/bin/pi --model x \\"; do
  before="$(ls "$PI_RUNS_DIR/pi-dispatch" | wc -l | tr -d ' ')"
  PI_DISPATCH_CMD="$bad" bash "$DISPATCH" "brief op" > /dev/null 2> "$TMP/err"; rc=$?
  after="$(ls "$PI_RUNS_DIR/pi-dispatch" | wc -l | tr -d ' ')"
  if [ "$rc" = "2" ] && [ "$before" = "$after" ] && grep -q 'PI_DISPATCH_CMD' "$TMP/err"; then
    ok "a command with a shell operator is refused: $bad"
  else
    bad "operator refusal: $bad" "rc=$rc $(cat "$TMP/err")"
  fi
done

# --- --provider without --model does not route --------------------------------
# Measured against pi 2026-09-15: pi resolves the model first and the provider
# follows it, so `--provider X` alone lands on pi's default while looking pinned.
before="$(ls "$PI_RUNS_DIR/pi-dispatch" | wc -l | tr -d ' ')"
PI_DISPATCH_CMD="$TMP/bin/pi --provider cursor" bash "$DISPATCH" "brief provider" > /dev/null 2> "$TMP/err"; rc=$?
after="$(ls "$PI_RUNS_DIR/pi-dispatch" | wc -l | tr -d ' ')"
if [ "$rc" = "2" ] && [ "$before" = "$after" ] && grep -q -- '--model' "$TMP/err"; then ok "--provider without --model is refused"; else bad "provider-only" "rc=$rc $(cat "$TMP/err")"; fi
PI_DISPATCH_CMD="$TMP/bin/pi --provider cursor --models grok" bash "$DISPATCH" "brief models" > /dev/null 2> "$TMP/err"; rc=$?
[ "$rc" = "2" ] && ok "--models does not count as --model" || bad "--models" "rc=$rc $(cat "$TMP/err")"
reset_logs
PI_DISPATCH_CMD="$TMP/bin/pi --provider cursor --model grok" launch "brief provider+model" >/dev/null
[ -s "$ARGVLOG" ] && ok "--provider with --model launches" || bad "provider+model" "$(cat "$TMP/err")"

# --- the command cannot undo the fence the dispatch sets up -------------------
# PI_CWD, PI_WRITABLE_FILES, PI_REAL_GIT and PATH carry the fence; env options
# (-i, -u, ...) could clear them; a relative binary would resolve inside PI_CWD.
for bad in "PI_CWD= $TMP/bin/pi" "env PATH=/usr/bin $TMP/bin/pi" "env PI_WRITABLE_FILES=/etc/x $TMP/bin/pi" \
           "PI_REAL_GIT=/usr/bin/git $TMP/bin/pi" "env -i $TMP/bin/pi" "env -u PI_CWD $TMP/bin/pi" "./bin/pi"; do
  PI_DISPATCH_CMD="$bad" bash "$DISPATCH" "brief fence" > /dev/null 2> "$TMP/err"; rc=$?
  [ "$rc" = "2" ] && grep -q 'PI_DISPATCH_CMD' "$TMP/err" && ok "refused: $bad" || bad "fence refusal: $bad" "rc=$rc $(cat "$TMP/err")"
done
reset_logs
PI_DISPATCH_CMD="env OTHER_DIR=x $TMP/bin/pi --model a/b" launch "brief ok prefix" >/dev/null
[ -s "$ARGVLOG" ] && ok "an unrelated env assignment still launches" || bad "unrelated assignment" "$(cat "$TMP/err")"

# --- words are not globbed against the worktree -------------------------------
reset_logs
: > "$PI_CWD/a"
PI_DISPATCH_CMD="$TMP/bin/pi --thinking [a] --model gpt-5.*" launch "brief glob" >/dev/null
case "$(cat "$ARGVLOG")" in
  "--thinking [a] --model gpt-5.* "*) ok "glob characters reach the agent literally" ;;
  *) bad "glob" "$(cat "$ARGVLOG")" ;;
esac
rm -f "$PI_CWD/a"

# --- the check seam the probe uses --------------------------------------------
got="$(PI_DISPATCH_CHECK=1 PI_DISPATCH_CMD="FOO=1 env BAR=\$HOME $TMP/bin/pi --model a/b" bash "$DISPATCH")"; rc=$?
[ "$rc" = 0 ] && [ "$got" = "BIN=$TMP/bin/pi" ] && ok "PI_DISPATCH_CHECK=1 prints the binary and launches nothing" || bad "check seam" "rc=$rc $got"
PI_DISPATCH_CHECK=1 PI_DISPATCH_CMD="pi --provider x" bash "$DISPATCH" > /dev/null 2> "$TMP/err"; rc=$?
[ "$rc" = 2 ] && ok "PI_DISPATCH_CHECK=1 refuses what a dispatch refuses" || bad "check seam refusal" "rc=$rc"

# --- the variables PI_DISPATCH_CMD replaced are refused, not ignored --------
# Ignoring a leftover PI_MODEL would run the batch on a model nobody chose.
for v in PI_BIN PI_PROVIDER PI_MODEL PI_EXTRA_ARGS; do
  reset_logs
  env "$v=x" bash "$DISPATCH" "brief legacy" > /dev/null 2> "$TMP/err"; rc=$?
  if [ "$rc" = "2" ] && grep -q "$v" "$TMP/err" && grep -q 'PI_DISPATCH_CMD' "$TMP/err" && [ ! -s "$ARGVLOG" ]; then
    ok "$v set exits 2, names itself and PI_DISPATCH_CMD, never launches"
  else
    bad "$v refusal" "rc=$rc $(cat "$TMP/err")"
  fi
done
reset_logs
PI_MODEL= launch "brief empty legacy" > /dev/null
[ -s "$ARGVLOG" ] && ok "a legacy variable set to empty is treated as unset" || bad "empty legacy" "$(cat "$TMP/err")"

got="$(PI_CONFIG_FILES=/tmp/stale.yml bash "$DISPATCH" "brief cfg" 2>&1 >/dev/null)"
case "$got" in
  *"PI_CONFIG_FILES is ignored"*) ok "leftover PI_CONFIG_FILES still warns (omp migration guard)" ;;
  *) bad "PI_CONFIG_FILES warning" "$got" ;;
esac

# --- resume replays the recorded command over the env -----------------------
# The session belongs to the binary that wrote it, so a follow-up turn must not
# move to whatever the shell says now.
reset_logs
PI_DISPATCH_CMD="env STUB_VAR=hijack $TMP/bin/pi --model other/y" launch "follow-up" "$PI_RUNS_DIR/pi-dispatch" "$R1" >/dev/null
got="$(cat "$ARGVLOG")"
case "$got" in
  "--model prov/model-x "*) ok "resume replays the recorded command, not the env" ;;
  *) bad "resume command" "$got" ;;
esac
grep -qx 'STUB_VAR=from-cmd' "$ENVLOG" && ok "resume replays the recorded env assignment" || bad "resume env" "$(cat "$ENVLOG")"
case "$got" in
  *"--session sess-stub"*) ok "resume passes --session <id>" ;;
  *) bad "resume flag" "$got" ;;
esac
case "$got" in
  *"--session-dir $R1/sessions"*) ok "resume points --session-dir at the PRIOR run's sessions" ;;
  *) bad "resume session-dir" "$got" ;;
esac

reset_logs
env -u PI_DISPATCH_CMD bash "$DISPATCH" "follow-up unset" "$PI_RUNS_DIR/pi-dispatch" "$R1" > /dev/null 2> "$TMP/err"
for _ in $(seq 1 50); do [ -s "$ARGVLOG" ] && break; sleep 0.1; done
case "$(cat "$ARGVLOG")" in
  "--model prov/model-x "*) ok "a resume needs no PI_DISPATCH_CMD: the record carries it" ;;
  *) bad "resume with env unset" "$(cat "$ARGVLOG") $(cat "$TMP/err")" ;;
esac

# A run recorded before CMD= existed carries PROVIDER=/MODEL= instead. The
# session file already names its model, so the env command resumes it.
LEGACY="$PI_RUNS_DIR/pi-dispatch/legacy-run"
mkdir -p "$LEGACY"
printf 'PROVIDER=cursor\nMODEL=grok\nCWD=%s\nWRITABLE=\n' "$PI_CWD" > "$LEGACY/routing"
echo '{"type":"session","id":"sess-old"}' > "$LEGACY/pi.stream.jsonl"
reset_logs
PI_DISPATCH_CMD="$TMP/bin/pi" launch "legacy follow-up" "$PI_RUNS_DIR/pi-dispatch" "$LEGACY" >/dev/null
got="$(cat "$ARGVLOG")"
case "$got" in
  "-p --mode json "*"--session sess-old"*) ok "a pre-CMD record resumes on the env command" ;;
  *) bad "legacy resume" "$got" ;;
esac
grep -q 'no CMD' "$TMP/err" && ok "the pre-CMD resume says so on stderr" || bad "legacy warning" "$(cat "$TMP/err")"

echo "---"
echo "pass: $PASS, fail: $FAIL"
[ "$FAIL" -eq 0 ]
