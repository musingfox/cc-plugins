#!/usr/bin/env bash
# writable-test.sh — committed behavior test for PI_WRITABLE_FILES in pi-dispatch.sh.
# Pure-local, NO pi, NO network: PI_DISPATCH_CMD is a stand-in that reports what it can
# write and what it was handed.
#
#   unsafe entry      -> exit 2 before any RUNDIR exists: relative, missing
#                        parent, a double quote, a backslash, a newline anywhere
#                        in the variable, an existing directory
#   empty segments    -> skipped, as PATH does
#
# The declared files live under /tmp/writable-test.*, never under TMPDIR: the
# sandbox allows the per-user temp dir wholesale, which would make every write
# assertion pass vacuously.
#
# Returns 0 iff every assertion holds.

set -uo pipefail

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   - $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH="$SCRIPT_DIR/../scripts/pi-dispatch.sh"

unset PI_BIN PI_PROVIDER PI_MODEL PI_EXTRA_ARGS PI_CONFIG_FILES PI_WRITABLE_FILES

TMP="$(mktemp -d)"
TMP="$(cd "$TMP" && pwd -P)"
WDIR="$(mktemp -d /tmp/writable-test.XXXXXX)"
trap 'rm -rf "$TMP" "$WDIR"' EXIT
WDIR_C="$(cd "$WDIR" && pwd -P)"

tmpdir_c="$(cd "${TMPDIR:-/nonexistent}" 2>/dev/null && pwd -P || true)"
case "$WDIR_C/" in
  "${tmpdir_c:-/nonexistent}/"*) bad "precondition: $WDIR_C is under TMPDIR $tmpdir_c"; echo "passed=$PASS failed=$FAIL"; exit 1 ;;
  *) ok "precondition: the declared directory is not under TMPDIR" ;;
esac

SHIM="$TMP/pi-shim"
cat > "$SHIM" <<'EOF'
#!/usr/bin/env bash
printf 'WRITABLE_ENV=%s\n' "${PI_WRITABLE_FILES-<unset>}"
EOF
chmod +x "$SHIM"

CALLER="$TMP/caller"; WORK="$TMP/work"; OUT="$TMP/runs"
mkdir -p "$CALLER" "$WORK" "$OUT"
printf 'do nothing\n' > "$CALLER/brief.md"

launch() { # usage: launch <env assignments...> "$DISPATCH" args...   (runs from CALLER)
  local out rundir
  out="$(cd "$CALLER" && env "$@")" || return 1
  rundir="$(printf '%s\n' "$out" | sed -n 's/^RUNDIR=//p')"
  for _ in $(seq 1 50); do [ -s "$rundir/rc" ] && break; sleep 0.1; done
  printf '%s\n' "$rundir"
}
field() { sed -n "s/^$2=//p" "$1/result.md"; }

# --- unsafe entries are refused before a RUNDIR exists ---
refused() { # usage: refused <label> <PI_WRITABLE_FILES value>
  local before rc
  before="$(ls "$OUT" | wc -l | tr -d ' ')"
  (cd "$CALLER" && env PI_DISPATCH_CMD="$SHIM" PI_CWD="$WORK" "PI_WRITABLE_FILES=$2" "$DISPATCH" "$CALLER/brief.md" "$OUT" >/dev/null 2>"$TMP/err")
  rc=$?
  if [ "$rc" = "2" ] && grep -q 'pi-dispatch: PI_WRITABLE_FILES' "$TMP/err"; then ok "$1 -> exit 2 naming PI_WRITABLE_FILES"; else bad "$1 -> rc=$rc err=$(cat "$TMP/err")"; fi
  if [ "$before" = "$(ls "$OUT" | wc -l | tr -d ' ')" ]; then ok "$1 -> no RUNDIR created"; else bad "$1 -> RUNDIR created"; fi
}
refused "relative entry" "rel/report.md"
refused "missing parent" "$WDIR/nope/report.md"
refused "double quote" "$WDIR/re\"port.md"
refused "backslash" "$WDIR/re\\port.md"
refused "newline after a valid entry" "$WDIR/report.md"$'\n''CWD=/'
refused "existing directory" "$WDIR"

# --- empty segments are skipped ---
RD="$(launch PI_DISPATCH_CMD="$SHIM" PI_CWD="$WORK" "PI_WRITABLE_FILES=:$WDIR/report.md:" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
if [ -n "$RD" ] && [ "$(sed -n 's/^WRITABLE=//p' "$RD/routing")" = "$WDIR_C/report.md" ]; then ok "empty segments skipped -> routing records exactly one path"; else bad "empty segments -> $(tr '\n' ' ' < "$RD/routing" 2>/dev/null)"; fi

# --- on macOS the sandbox lets the worker write the declared file and nothing beside it ---
if [ "$(uname -s)" = Darwin ] && command -v sandbox-exec >/dev/null 2>&1; then
  cat > "$TMP/pi-writer" <<'EOF2'
#!/usr/bin/env bash
dir="${@: -1}"   # the PROMPT is pi's last argv; the test passes the declared dir there
{ : > "$dir/report.md" && echo body >> "$dir/report.md"; } 2>/dev/null && echo DECLARED=written || echo DECLARED=denied
: > "$dir/sibling.md" 2>/dev/null && echo SIBLING=written || echo SIBLING=denied
EOF2
  chmod +x "$TMP/pi-writer"
  RD="$(launch PI_DISPATCH_CMD="$TMP/pi-writer" PI_CWD="$WORK" PI_PROMPT="$WDIR" "PI_WRITABLE_FILES=$WDIR/report.md" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
  if [ -f "$RD/sandbox.sb" ] && [ "$(field "$RD" DECLARED)" = written ] && [ "$(field "$RD" SIBLING)" = denied ]; then ok "sandbox: declared file written, sibling denied"; else bad "sandbox enforcement -> $(grep -E '^(DECLARED|SIBLING)=' "$RD/result.md" | tr '\n' ' ')"; fi
  if [ -f "$WDIR/report.md" ] && [ ! -e "$WDIR/sibling.md" ]; then ok "sandbox: report.md exists, sibling.md absent"; else bad "sandbox files -> $(ls "$WDIR" | tr '\n' ' ')"; fi
  if grep -qF "(literal \"$WDIR_C/report.md\")" "$RD/sandbox.sb" && ! grep -qF "(subpath \"$WDIR_C\")" "$RD/sandbox.sb"; then ok "sandbox.sb holds a canonical literal and no subpath of its parent"; else bad "sandbox.sb -> $(grep -F "$WDIR_C" "$RD/sandbox.sb")"; fi
  rm -f "$WDIR/report.md" "$WDIR/sibling.md"
  RD="$(launch PI_DISPATCH_CMD="$TMP/pi-writer" PI_CWD="$WORK" PI_SANDBOX=0 PI_PROMPT="$WDIR" "PI_WRITABLE_FILES=$WDIR/report.md" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
  if [ ! -f "$RD/sandbox.sb" ] && [ "$(field "$RD" SIBLING)" = written ]; then ok "PI_SANDBOX=0 -> the sibling is writable (positive control)"; else bad "PI_SANDBOX=0 -> $(grep SIBLING= "$RD/result.md")"; fi
  rm -f "$WDIR/report.md" "$WDIR/sibling.md"
else
  echo "skip - sandbox cases need macOS sandbox-exec"
fi

# --- the list is recorded and replayed on resume; the record beats the env ---
HAS_SB=0
[ "$(uname -s)" = Darwin ] && command -v sandbox-exec >/dev/null 2>&1 && HAS_SB=1
rec() { sed -n 's/^WRITABLE=//p' "$1/routing"; }
has_lit() { [ "$HAS_SB" = 0 ] || grep -qF "(literal \"$2\")" "$1/sandbox.sb"; }
no_lit() { [ "$HAS_SB" = 0 ] || { [ -f "$1/sandbox.sb" ] && ! grep -q '(literal "/private/tmp/writable-test' "$1/sandbox.sb"; }; }
DECL="$WDIR_C/report.md"

P1="$(launch PI_DISPATCH_CMD="$SHIM" PI_CWD="$WORK" "PI_WRITABLE_FILES=$WDIR/report.md" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
if [ "$(rec "$P1")" = "$DECL" ] && [ "$(field "$P1" WRITABLE_ENV)" = "$DECL" ]; then ok "fresh -> routing and worker env hold the canonical path"; else bad "fresh -> rec=$(rec "$P1") env=$(field "$P1" WRITABLE_ENV)"; fi
P0="$(launch PI_DISPATCH_CMD="$SHIM" PI_CWD="$WORK" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
if grep -qx 'WRITABLE=' "$P0/routing"; then ok "fresh with nothing declared -> routing has an empty WRITABLE= line"; else bad "fresh empty -> $(tr '\n' ' ' < "$P0/routing")"; fi

RD="$(launch PI_DISPATCH_CMD="$SHIM" "$DISPATCH" "$CALLER/brief.md" "$OUT" "$P1" 2>/dev/null)"
if [ "$(rec "$RD")" = "$DECL" ] && has_lit "$RD" "$DECL" && [ "$(field "$RD" WRITABLE_ENV)" = "$DECL" ]; then ok "resume with the env unset -> recorded list replayed to routing, profile and worker"; else bad "resume unset -> rec=$(rec "$RD") env=$(field "$RD" WRITABLE_ENV)"; fi

RD="$(launch PI_DISPATCH_CMD="$SHIM" "PI_WRITABLE_FILES=$WDIR/other.md" "$DISPATCH" "$CALLER/brief.md" "$OUT" "$P1" 2>/dev/null)"
if [ "$(rec "$RD")" = "$DECL" ] && [ "$(field "$RD" WRITABLE_ENV)" = "$DECL" ] && ! grep -q other.md "$RD/routing" && { [ "$HAS_SB" = 0 ] || ! grep -q other.md "$RD/sandbox.sb"; } && has_lit "$RD" "$DECL"; then ok "resume with a different env -> the record wins"; else bad "resume precedence -> rec=$(rec "$RD") env=$(field "$RD" WRITABLE_ENV)"; fi

RD="$(launch PI_DISPATCH_CMD="$SHIM" "PI_WRITABLE_FILES=$WDIR/report.md" "$DISPATCH" "$CALLER/brief.md" "$OUT" "$P0" 2>/dev/null)"
if [ "$(rec "$RD")" = "" ] && grep -qx 'WRITABLE=' "$RD/routing" && no_lit "$RD" && [ "$(field "$RD" WRITABLE_ENV)" = "" ]; then ok "resume of an empty record -> the env does not widen it"; else bad "empty record -> rec=$(rec "$RD") env=$(field "$RD" WRITABLE_ENV)"; fi

LEGACY="$(launch PI_DISPATCH_CMD="$SHIM" PI_CWD="$WORK" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
sed -i '' '/^WRITABLE=/d' "$LEGACY/routing"
RD="$(launch PI_DISPATCH_CMD="$SHIM" "PI_WRITABLE_FILES=$WDIR/report.md" "$DISPATCH" "$CALLER/brief.md" "$OUT" "$LEGACY" 2>/dev/null)"
if [ "$(rec "$RD")" = "$DECL" ] && [ "$(field "$RD" WRITABLE_ENV)" = "$DECL" ]; then ok "resume of a legacy record without WRITABLE= -> the env is used and recorded"; else bad "legacy -> rec=$(rec "$RD")"; fi

# A terminal poll must leave WRITABLE= in the record.
POLL="$SCRIPT_DIR/../scripts/pi-poll.sh"
JSHIM="$TMP/pi-json-shim"
cat > "$JSHIM" <<'EOF3'
#!/usr/bin/env bash
printf '{"type":"session","id":"sess-new","cwd":"%s"}\n' "$(pwd -P)"
echo '{"type":"message_end","message":{"role":"assistant","usage":{"cost":{"total":0.01}}}}'
echo '{"type":"agent_end","messages":[{"role":"assistant","stopReason":"stop","text":"done","provider":"openai-codex","model":"gpt-5.6-terra"}]}'
printf 'WRITABLE_ENV=%s\n' "${PI_WRITABLE_FILES-<unset>}"
EOF3
chmod +x "$JSHIM"
RD="$(launch PI_DISPATCH_CMD="$JSHIM" PI_CWD="$WORK" "PI_WRITABLE_FILES=$WDIR/report.md" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
bash "$POLL" "$RD" >/dev/null 2>&1
if [ "$(rec "$RD")" = "$DECL" ]; then ok "terminal poll keeps WRITABLE="; else bad "poll -> $(tr '\n' ' ' < "$RD/routing")"; fi
RD2="$(launch PI_DISPATCH_CMD="$SHIM" "$DISPATCH" "$CALLER/brief.md" "$OUT" "$RD" 2>/dev/null)"
if [ "$(rec "$RD2")" = "$DECL" ] && [ "$(field "$RD2" WRITABLE_ENV)" = "$DECL" ]; then ok "resume after a terminal poll -> WRITABLE= replayed"; else bad "resume after poll -> rec=$(rec "$RD2") env=$(field "$RD2" WRITABLE_ENV)"; fi

# --- the launch line names the writable list ---
out="$(cd "$CALLER" && env PI_DISPATCH_CMD="$SHIM" PI_CWD="$WORK" "PI_WRITABLE_FILES=$WDIR/report.md" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
if printf '%s\n' "$out" | head -n 1 | grep -qE "^CWD=.* WRITABLE=$DECL\$"; then ok "launch line ends with WRITABLE=<canonical list>"; else bad "launch line -> $(printf '%s\n' "$out" | head -n 1)"; fi
out="$(cd "$CALLER" && env PI_DISPATCH_CMD="$SHIM" PI_CWD="$WORK" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
rundirs="$(printf '%s\n' "$out" | sed -n 's/^RUNDIR=//p')"
case "$(printf '%s\n' "$out" | grep '^CWD=')" in
  *" WRITABLE=") ok "launch with nothing declared -> CWD line ends with ' WRITABLE='" ;;
  *) bad "empty launch line -> $(printf '%s\n' "$out" | grep '^CWD=')" ;;
esac
if [ "$(printf '%s\n' "$rundirs" | wc -l | tr -d ' ')" = 1 ] && [ -d "$rundirs" ]; then ok "RUNDIR= still yields one existing directory"; else bad "RUNDIR -> $rundirs"; fi
for _ in $(seq 1 50); do [ -s "$rundirs/rc" ] && break; sleep 0.1; done

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
