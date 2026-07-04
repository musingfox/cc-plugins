#!/usr/bin/env bash
# agent-test.sh — committed behavior test for pi-agent.sh (the unified,
# name-addressed entry point). Pure-local: PI_BIN is a stub that emits a
# canned json event stream, so no real model, no network, deterministic.
#
# Pins:
#   start        registers NAME -> RUNDIR symlink, echoes NAME=
#   start dup    refuses an existing NAME
#   poll         routes to pi-poll.sh, reaches STATUS=OK on the stub stream
#   send (batch) resumes the finished run (new RUNDIR), re-points the symlink
#   ls           one line per agent, correct mode detection (batch vs acp)
#   watch        emits per-agent lines, exits 0 when nothing is in flight
#   stop         unregisters the NAME
#   unknown NAME poll fails non-zero

set -uo pipefail

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

SCRIPTS="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export PI_RUNS_DIR="$TMP/runs"
REG="$PI_RUNS_DIR/agents"

# Stub omp: emits a session line + a clean agent_end. On --resume the reply
# text differs, so the send/resume path is distinguishable from a fresh run.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/omp" <<'EOF'
#!/usr/bin/env bash
resumed=no
for a in "$@"; do [ "$a" = "--resume" ] && resumed=yes; done
echo '{"type":"session","id":"sess-stub"}'
[ "$resumed" = yes ] && txt="resumed reply" || txt="first reply"
echo "{\"type\":\"agent_end\",\"messages\":[{\"stopReason\":\"stop\",\"content\":[{\"type\":\"text\",\"text\":\"$txt\"}]}]}"
EOF
chmod +x "$TMP/bin/omp"
export PI_BIN="$TMP/bin/omp"

wait_terminal() { # NAME -> echoes final poll line
  local line
  for _ in $(seq 1 50); do
    line="$("$SCRIPTS/pi-agent.sh" poll "$1" 2>/dev/null)"
    case "$line" in STATUS=*) printf '%s\n' "$line"; return 0 ;; esac
    sleep 0.2
  done
  printf '%s\n' "$line"
}

# --- start: registers + echoes NAME= ---
OUT="$("$SCRIPTS/pi-agent.sh" start worker-a "say hi")"
case "$OUT" in *"NAME=worker-a"*) ok "start echoes NAME=" ;; *) bad "start echoes NAME= (got: $OUT)" ;; esac
[ -L "$REG/worker-a" ] && ok "start registers symlink" || bad "start registers symlink"
DIR1="$(readlink "$REG/worker-a")"

# --- start dup: refused ---
if "$SCRIPTS/pi-agent.sh" start worker-a "again" >/dev/null 2>&1; then
  bad "duplicate NAME refused"
else
  ok "duplicate NAME refused"
fi

# --- poll: terminal OK on stub stream ---
LINE="$(wait_terminal worker-a)"
case "$LINE" in STATUS=OK*) ok "poll reaches STATUS=OK" ;; *) bad "poll reaches STATUS=OK (got: $LINE)" ;; esac

# --- send (batch): resumes, re-points symlink, resumed text lands ---
"$SCRIPTS/pi-agent.sh" send worker-a "follow-up" >/dev/null
DIR2="$(readlink "$REG/worker-a")"
[ "$DIR1" != "$DIR2" ] && ok "send re-points symlink to resume RUNDIR" || bad "send re-points symlink"
LINE="$(wait_terminal worker-a)"
case "$LINE" in STATUS=OK*) ok "resumed run reaches STATUS=OK" ;; *) bad "resumed run STATUS=OK (got: $LINE)" ;; esac
grep -q "resumed reply" "$DIR2/result.md" && ok "resume path hit (--resume seen by stub)" || bad "resume path hit"

# --- ls: mode detection (fabricate a dead acp rundir) ---
ACPDIR="$TMP/acp-fake"; mkdir -p "$ACPDIR"; mkfifo "$ACPDIR/in.fifo"
ln -sfn "$ACPDIR" "$REG/worker-b"
LS="$("$SCRIPTS/pi-agent.sh" ls)"
case "$LS" in *"worker-a mode=batch STATUS=OK"*) ok "ls shows batch agent + status" ;; *) bad "ls batch line (got: $LS)" ;; esac
case "$LS" in *"worker-b mode=acp STATUS=DEAD"*) ok "ls detects acp mode" ;; *) bad "ls acp line (got: $LS)" ;; esac

# --- watch: emits lines, exits 0 with nothing in flight ---
W="$("$SCRIPTS/pi-agent.sh" watch 1)"; RC=$?
[ "$RC" = 0 ] && ok "watch exits 0 when idle" || bad "watch exit rc=$RC"
case "$W" in *"worker-a: STATUS=OK"*) ok "watch emits per-agent state" ;; *) bad "watch per-agent state (got: $W)" ;; esac
case "$W" in *"no agents in flight"*) ok "watch terminal marker" ;; *) bad "watch terminal marker" ;; esac

# --- stop: unregisters ---
"$SCRIPTS/pi-agent.sh" stop worker-b >/dev/null
[ ! -e "$REG/worker-b" ] && ok "stop unregisters NAME" || bad "stop unregisters NAME"

# --- unknown NAME: non-zero ---
if "$SCRIPTS/pi-agent.sh" poll nope >/dev/null 2>&1; then
  bad "unknown NAME fails"
else
  ok "unknown NAME fails"
fi

echo "---"
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
