#!/usr/bin/env bash
# run-test.sh — committed behavior test for pi-run.sh (run-to-terminal + watchdog).
# Pure-local, stubbed omp, no network.
#
# Pins:
#   T1  clean run   -> single OUTCOME=OK line carrying OUTPUT/RUNDIR + poll line
#   T2  failing run -> OUTCOME=FAIL (stopReason!=stop surfaces through)
#   T3  deadline    -> long worker, small --deadline -> OUTCOME=FAIL deadline, worker dead
#   T4  ORPHAN SAFETY: caller killed mid-wait -> detached watchdog still reaps
#       the worker at deadline (pi.pid dead + RUNDIR/watchdog stamped)

set -uo pipefail

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
export PI_RUNS_DIR="$TMP/runs"
export PI_POLL_INTERVAL_S=1

mkdir -p "$TMP/bin"

# Stub omp: MODE env selects behavior (ok / err / hang).
cat > "$TMP/bin/omp" <<'EOF'
#!/usr/bin/env bash
echo '{"type":"session","id":"sess-stub"}'
case "${STUB_MODE:-ok}" in
  ok)   echo '{"type":"agent_end","messages":[{"stopReason":"stop","content":[{"type":"text","text":"done"}]}]}' ;;
  err)  echo '{"type":"agent_end","messages":[{"stopReason":"error","content":[{"type":"text","text":"boom"}]}]}' ;;
  hang) sleep 300 ;;
esac
EOF
chmod +x "$TMP/bin/omp"
export PI_BIN="$TMP/bin/omp"

# --- T1: clean run ---
OUT="$(STUB_MODE=ok "$SCRIPTS/pi-run.sh" "say hi" "$TMP/t1")"
case "$OUT" in
  "OUTCOME=OK OUTPUT="*"RUNDIR="*"| STATUS=OK"*) ok "T1 clean run -> OUTCOME=OK one-liner" ;;
  *) bad "T1 clean run (got: $OUT)" ;;
esac
[ "$(printf '%s\n' "$OUT" | wc -l | tr -d ' ')" = 1 ] && ok "T1 exactly one line" || bad "T1 exactly one line"

# --- T2: failing run ---
OUT="$(STUB_MODE=err "$SCRIPTS/pi-run.sh" "say hi" "$TMP/t2")"
case "$OUT" in
  OUTCOME=FAIL*) ok "T2 error run -> OUTCOME=FAIL" ;;
  *) bad "T2 error run (got: $OUT)" ;;
esac

# --- T3: deadline fires inside the call ---
OUT="$(STUB_MODE=hang "$SCRIPTS/pi-run.sh" --deadline 3 "hang" "$TMP/t3")"
case "$OUT" in
  OUTCOME=FAIL*) ok "T3 deadline -> OUTCOME=FAIL ($( printf '%s' "$OUT" | sed 's/.*| //'))" ;;
  *) bad "T3 deadline (got: $OUT)" ;;
esac
R3="$(printf '%s\n' "$OUT" | sed -n 's/.*RUNDIR=\([^ ]*\).*/\1/p')"
P3="$(cat "$R3/pi.pid" 2>/dev/null)"
if [ -n "$P3" ] && ! kill -0 "$P3" 2>/dev/null; then ok "T3 worker reaped"; else bad "T3 worker reaped"; fi

# --- T4: caller killed mid-wait -> watchdog reaps ---
STUB_MODE=hang "$SCRIPTS/pi-run.sh" --deadline 4 "hang" "$TMP/t4" > "$TMP/t4.out" 2>&1 &
CALLER=$!
sleep 2
kill -KILL "$CALLER" 2>/dev/null   # simulate the harness killing the Bash call
R4="$(ls -d "$TMP/t4"/run-* 2>/dev/null | head -1)"
P4="$(cat "$R4/pi.pid" 2>/dev/null)"
if [ -n "$P4" ] && kill -0 "$P4" 2>/dev/null; then
  ok "T4 precondition: worker still alive after caller death"
else
  bad "T4 precondition: worker still alive after caller death"
fi
# Wait past the deadline for the detached watchdog to fire.
DEAD=0
for _ in $(seq 1 20); do
  if [ -n "$P4" ] && ! kill -0 "$P4" 2>/dev/null; then DEAD=1; break; fi
  sleep 1
done
[ "$DEAD" = 1 ] && ok "T4 watchdog reaped orphan after caller death" || bad "T4 watchdog reaped orphan"
# Marker lands after pi-stop's TERM->sleep->KILL sequence returns; poll for it.
MARK=0
for _ in $(seq 1 10); do
  [ -f "$R4/watchdog" ] && { MARK=1; break; }
  sleep 1
done
[ "$MARK" = 1 ] && ok "T4 watchdog marker stamped" || bad "T4 watchdog marker stamped"

echo "---"
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
