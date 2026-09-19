#!/usr/bin/env bash
# writable-test.sh — committed behavior test for PI_WRITABLE_FILES in pi-dispatch.sh.
# Pure-local, NO pi, NO network: PI_BIN is a stand-in that reports what it can
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

unset PI_PROVIDER PI_MODEL PI_CONFIG_FILES PI_WRITABLE_FILES

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
  (cd "$CALLER" && env PI_BIN="$SHIM" PI_CWD="$WORK" "PI_WRITABLE_FILES=$2" "$DISPATCH" "$CALLER/brief.md" "$OUT" >/dev/null 2>"$TMP/err")
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
RD="$(launch PI_BIN="$SHIM" PI_CWD="$WORK" "PI_WRITABLE_FILES=:$WDIR/report.md:" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
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
  RD="$(launch PI_BIN="$TMP/pi-writer" PI_CWD="$WORK" PI_PROMPT="$WDIR" "PI_WRITABLE_FILES=$WDIR/report.md" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
  if [ -f "$RD/sandbox.sb" ] && [ "$(field "$RD" DECLARED)" = written ] && [ "$(field "$RD" SIBLING)" = denied ]; then ok "sandbox: declared file written, sibling denied"; else bad "sandbox enforcement -> $(grep -E '^(DECLARED|SIBLING)=' "$RD/result.md" | tr '\n' ' ')"; fi
  if [ -f "$WDIR/report.md" ] && [ ! -e "$WDIR/sibling.md" ]; then ok "sandbox: report.md exists, sibling.md absent"; else bad "sandbox files -> $(ls "$WDIR" | tr '\n' ' ')"; fi
  if grep -qF "(literal \"$WDIR_C/report.md\")" "$RD/sandbox.sb" && ! grep -qF "(subpath \"$WDIR_C\")" "$RD/sandbox.sb"; then ok "sandbox.sb holds a canonical literal and no subpath of its parent"; else bad "sandbox.sb -> $(grep -F "$WDIR_C" "$RD/sandbox.sb")"; fi
  rm -f "$WDIR/report.md" "$WDIR/sibling.md"
  RD="$(launch PI_BIN="$TMP/pi-writer" PI_CWD="$WORK" PI_SANDBOX=0 PI_PROMPT="$WDIR" "PI_WRITABLE_FILES=$WDIR/report.md" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
  if [ ! -f "$RD/sandbox.sb" ] && [ "$(field "$RD" SIBLING)" = written ]; then ok "PI_SANDBOX=0 -> the sibling is writable (positive control)"; else bad "PI_SANDBOX=0 -> $(grep SIBLING= "$RD/result.md")"; fi
  rm -f "$WDIR/report.md" "$WDIR/sibling.md"
else
  echo "skip - sandbox cases need macOS sandbox-exec"
fi

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
