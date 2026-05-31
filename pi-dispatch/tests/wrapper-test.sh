#!/usr/bin/env bash
# wrapper-test.sh — committed behavior test for the perl POSIX::setsid rc-capture
# wrapper used by pi-dispatch.sh. Pure-local, NO pi, NO network, deterministic.
#
# It exercises the SAME perl one-liner pi-dispatch.sh uses, against stand-in
# commands, and asserts the `rc` file content:
#   exit 0           -> rc file == 0
#   exit 7           -> rc file == 7
#   self SIGTERM     -> rc file == 143   (128 + 15, shell signal convention)
#   group-killed     -> NO rc file       (wrapper dies before it can record rc)
#
# Returns 0 iff every assertion holds.

set -uo pipefail

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   - $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

# The wrapper under test — byte-for-byte the same perl logic as pi-dispatch.sh:
# setsid -> system(cmd) -> translate wait-status to shell-convention rc -> write rc.
# Backgrounded + disowned exactly like production so the group/leader behavior is real.
run_wrapper() {
  local rcfile="$1"; shift
  perl -MPOSIX -e '
    POSIX::setsid();
    my $rcfile = shift @ARGV;
    my $status = system(@ARGV);
    my $rc;
    if    ($status == -1)  { $rc = 127; }
    elsif ($status & 127)  { $rc = 128 + ($status & 127); }
    else                   { $rc = $status >> 8; }
    open(my $fh, ">", $rcfile) or exit 255;
    print $fh "$rc\n";
    close($fh);
  ' "$rcfile" "$@" >/dev/null 2>&1 &
  local wpid=$!
  disown 2>/dev/null || true
  echo "$wpid"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- Case 1: clean exit 0 -> rc == 0 ---
RC1="$TMP/rc1"
run_wrapper "$RC1" bash -c 'exit 0' >/dev/null
for _ in $(seq 1 50); do [ -f "$RC1" ] && break; sleep 0.1; done
if [ -f "$RC1" ] && [ "$(cat "$RC1")" = "0" ]; then ok "exit 0 -> rc=0"; else bad "exit 0 -> rc=$( [ -f "$RC1" ] && cat "$RC1" || echo MISSING)"; fi

# --- Case 2: exit 7 -> rc == 7 ---
RC2="$TMP/rc2"
run_wrapper "$RC2" bash -c 'exit 7' >/dev/null
for _ in $(seq 1 50); do [ -f "$RC2" ] && break; sleep 0.1; done
if [ -f "$RC2" ] && [ "$(cat "$RC2")" = "7" ]; then ok "exit 7 -> rc=7"; else bad "exit 7 -> rc=$( [ -f "$RC2" ] && cat "$RC2" || echo MISSING)"; fi

# --- Case 3: stand-in kills itself with SIGTERM -> rc == 143 (128+15) ---
RC3="$TMP/rc3"
run_wrapper "$RC3" bash -c 'kill -TERM $$; sleep 5' >/dev/null
for _ in $(seq 1 50); do [ -f "$RC3" ] && break; sleep 0.1; done
if [ -f "$RC3" ] && [ "$(cat "$RC3")" = "143" ]; then ok "self SIGTERM -> rc=143"; else bad "self SIGTERM -> rc=$( [ -f "$RC3" ] && cat "$RC3" || echo MISSING)"; fi

# --- Case 4: group-kill the wrapper mid-run -> NO rc file ---
# The wrapper is the process-group leader (setsid). Group-killing -PGID destroys it
# BEFORE its system() returns, so it never writes rc. The stand-in sleeps long
# enough that the kill always wins the race (no flaky early rc write).
RC4="$TMP/rc4"
WPID4="$(run_wrapper "$RC4" bash -c 'sleep 30')"
# Wait until the wrapper is actually running as its own group leader.
for _ in $(seq 1 50); do kill -0 "$WPID4" 2>/dev/null && break; sleep 0.1; done
# PGID == wrapper pid (setsid leader). Group-KILL it (SIGKILL: no chance to record rc).
kill -KILL -- -"$WPID4" 2>/dev/null || true
# Give it time to die; the rc file must NOT appear.
for _ in $(seq 1 20); do kill -0 "$WPID4" 2>/dev/null || break; sleep 0.1; done
sleep 0.3
if [ ! -f "$RC4" ]; then ok "group-killed -> no rc file"; else bad "group-killed -> rc file present (rc=$(cat "$RC4"))"; fi

echo "---"
echo "wrapper-test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
