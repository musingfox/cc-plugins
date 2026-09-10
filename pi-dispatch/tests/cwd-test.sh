#!/usr/bin/env bash
# cwd-test.sh — committed behavior test for PI_CWD in pi-dispatch.sh.
# Pure-local, NO pi, NO network: PI_BIN is a shim that records its cwd, the
# brief it was handed, the head of its PATH, and any -e extension.
#
#   PI_CWD unset      -> the worker runs in the caller's directory, unfenced
#   PI_CWD=<dir>      -> the worker runs in <dir>; routing records CWD=; shims/git
#                        is first on PATH with PI_REAL_GIT; the fence extension
#                        is passed via -e
#   PI_CWD relative   -> resolved against the caller, and a RELATIVE brief path
#                        still reaches the worker after the cd
#   PI_CWD not a dir  -> exit 2, no RUNDIR created
#   resume            -> the recorded CWD beats the env, like routing; a prior run
#                        without CWD= resumes in its session-header cwd; a missing
#                        prior rundir degrades to a fresh dispatch
#   relative PI_BIN   -> resolved before the cd
#
# Returns 0 iff every assertion holds.

set -uo pipefail

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   - $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH="$SCRIPT_DIR/../scripts/pi-dispatch.sh"
SHIMS="$(cd "$SCRIPT_DIR/../shims" && pwd -P)"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
TMP="$(cd "$TMP" && pwd -P)"

SHIM="$TMP/pi-shim"
cat > "$SHIM" <<'EOF'
#!/usr/bin/env bash
brief=""; ext=""
prev=""
for a in "$@"; do
  case "$a" in @*) brief="${a#@}";; esac
  [ "$prev" = "-e" ] && ext="$a"
  prev="$a"
done
printf 'CWD=%s\n' "$(pwd -P)"
printf 'BRIEF_EXISTS=%s\n' "$([ -f "$brief" ] && echo yes || echo no)"
printf 'PATH_HEAD=%s\n' "${PATH%%:*}"
printf 'REAL_GIT=%s\n' "${PI_REAL_GIT:-}"
printf 'EXT=%s\n' "$ext"
EOF
chmod +x "$SHIM"

CALLER="$TMP/caller"; WORK="$TMP/work"; WORK2="$TMP/work2"; OUT="$TMP/runs"
mkdir -p "$CALLER" "$WORK" "$WORK2" "$OUT"
printf 'do nothing\n' > "$CALLER/brief.md"

launch() { # usage: launch <env assignments...> "$DISPATCH" args...   (runs from CALLER)
  local out rundir
  out="$(cd "$CALLER" && env "$@")" || return 1
  rundir="$(printf '%s\n' "$out" | sed -n 's/^RUNDIR=//p')"
  for _ in $(seq 1 50); do [ -s "$rundir/rc" ] && break; sleep 0.1; done
  printf '%s\n' "$rundir"
}
field() { sed -n "s/^$2=//p" "$1/result.md"; }

# --- Case 1: PI_CWD unset -> caller's directory, no fence ---
RD="$(launch PI_BIN="$SHIM" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
if [ "$(field "$RD" CWD)" = "$CALLER" ]; then ok "unset -> worker cwd is the caller's"; else bad "unset -> $(field "$RD" CWD)"; fi
if grep -q '^CWD=$' "$RD/routing"; then ok "unset -> routing records an empty CWD"; else bad "unset -> routing: $(cat "$RD/routing" | tr '\n' ' ')"; fi
if [ "$(field "$RD" PATH_HEAD)" != "$SHIMS" ] && [ -z "$(field "$RD" EXT)" ]; then ok "unset -> no shim, no extension"; else bad "unset -> fenced anyway"; fi

# --- Case 2: PI_CWD absolute -> worker runs there, recorded, fenced ---
RD="$(launch PI_BIN="$SHIM" PI_CWD="$WORK" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
if [ "$(field "$RD" CWD)" = "$WORK" ]; then ok "PI_CWD -> worker cwd is PI_CWD"; else bad "PI_CWD -> $(field "$RD" CWD)"; fi
if grep -q "^CWD=$WORK$" "$RD/routing"; then ok "PI_CWD -> routing records CWD="; else bad "PI_CWD -> routing: $(cat "$RD/routing" | tr '\n' ' ')"; fi
if [ "$(field "$RD" PATH_HEAD)" = "$SHIMS" ] && [ -x "$SHIMS/git" ]; then ok "PI_CWD -> shims/git first on PATH"; else bad "PI_CWD -> PATH head $(field "$RD" PATH_HEAD)"; fi
if [ -x "$(field "$RD" REAL_GIT)" ] && [ "$(field "$RD" REAL_GIT)" != "$SHIMS/git" ]; then ok "PI_CWD -> PI_REAL_GIT points at the real git"; else bad "PI_CWD -> PI_REAL_GIT=$(field "$RD" REAL_GIT)"; fi
case "$(field "$RD" EXT)" in */extensions/worktree-fence.ts) ok "PI_CWD -> fence extension passed with -e";; *) bad "PI_CWD -> EXT=$(field "$RD" EXT)";; esac

# --- Case 3: relative PI_CWD + relative brief + relative OUTDIR ---
mkdir -p "$CALLER/rel-out"
RD="$(launch PI_BIN="$SHIM" PI_CWD="../work" "$DISPATCH" "brief.md" "rel-out")"
if [ "$(field "$RD" CWD)" = "$WORK" ]; then ok "relative PI_CWD resolves against the caller"; else bad "relative PI_CWD -> $(field "$RD" CWD)"; fi
if [ "$(field "$RD" BRIEF_EXISTS)" = "yes" ]; then ok "relative brief path survives the cd"; else bad "relative brief path lost after cd"; fi
case "$RD" in "$CALLER/rel-out/"*) ok "relative OUTDIR resolves against the caller";; *) bad "relative OUTDIR -> $RD";; esac

# --- Case 4: PI_CWD not a directory -> exit 2, nothing created ---
before="$(ls "$OUT" | wc -l | tr -d ' ')"
if (cd "$CALLER" && PI_BIN="$SHIM" PI_CWD="$TMP/nope" "$DISPATCH" "$CALLER/brief.md" "$OUT" >/dev/null 2>"$TMP/err"); then
  bad "bad PI_CWD -> should exit non-zero"
else
  rc=$?
  if [ "$rc" = "2" ] && grep -q 'PI_CWD is not a directory' "$TMP/err"; then ok "bad PI_CWD -> exit 2 with message"; else bad "bad PI_CWD -> rc=$rc err=$(cat "$TMP/err")"; fi
fi
after="$(ls "$OUT" | wc -l | tr -d ' ')"
if [ "$before" = "$after" ]; then ok "bad PI_CWD -> no RUNDIR created"; else bad "bad PI_CWD -> RUNDIR created"; fi

# --- Case 5: resume replays the recorded cwd and it beats the env; a missing prior degrades ---
PRIOR="$(launch PI_BIN="$SHIM" PI_CWD="$WORK" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
RD="$(launch PI_BIN="$SHIM" "$DISPATCH" "$CALLER/brief.md" "$OUT" "$PRIOR")"
if [ "$(field "$RD" CWD)" = "$WORK" ] && grep -q "^CWD=$WORK$" "$RD/routing"; then ok "resume without PI_CWD -> recorded cwd replayed"; else bad "resume -> $(field "$RD" CWD)"; fi
RD="$(launch PI_BIN="$SHIM" PI_CWD="$WORK2" "$DISPATCH" "$CALLER/brief.md" "$OUT" "$PRIOR")"
if [ "$(field "$RD" CWD)" = "$WORK" ]; then ok "resume with a different PI_CWD in env -> the record wins"; else bad "resume precedence -> $(field "$RD" CWD)"; fi
out="$(cd "$CALLER" && PI_BIN="$SHIM" PI_CWD="$WORK" "$DISPATCH" "$CALLER/brief.md" "$OUT" "$TMP/gone-rundir" 2>"$TMP/err")"; rc=$?
if [ "$rc" = "0" ] && printf '%s' "$out" | grep -q '^RUNDIR=' && grep -q 'starting a FRESH dispatch' "$TMP/err"; then ok "missing PRIOR_RUNDIR under PI_CWD -> warns, dispatches fresh"; else bad "missing PRIOR_RUNDIR -> rc=$rc $(cat "$TMP/err")"; fi

# --- Case 5b: a prior run without CWD= (pre-fix) resumes in its session-header cwd ---
sed -i '' '/^CWD=/d' "$PRIOR/routing"
printf '{"type":"session","id":"sess-old","cwd":"%s"}\n' "$WORK2" > "$PRIOR/pi.stream.jsonl"
RD="$(launch PI_BIN="$SHIM" PI_CWD="$WORK" "$DISPATCH" "$CALLER/brief.md" "$OUT" "$PRIOR")"
if [ "$(field "$RD" CWD)" = "$WORK2" ] && grep -q "^CWD=$WORK2$" "$RD/routing"; then ok "resume of a pre-CWD run -> session header cwd, now recorded"; else bad "pre-CWD resume -> $(field "$RD" CWD)"; fi

# --- Case 6: a relative PI_BIN survives the cd ---
RD="$(launch PI_BIN="../pi-shim" PI_CWD="$WORK" "$DISPATCH" "$CALLER/brief.md" "$OUT")"
if [ "$(field "$RD" CWD)" = "$WORK" ] && [ "$(cat "$RD/rc")" = "0" ]; then ok "relative PI_BIN resolves before the cd"; else bad "relative PI_BIN -> rc=$(cat "$RD/rc" 2>/dev/null || echo MISSING)"; fi

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
