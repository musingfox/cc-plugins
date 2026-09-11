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
#   ls           one line per agent, carrying that agent's poll status
#   watch        emits per-agent lines, exits 0 when nothing is in flight
#   quota class  the sibling stamp carries the class of the wall that triggered it
#   watch scope  only the NAMED agents are polled and quota-aborted; an unnamed
#                agent is neither reported nor killed, and no names is an error
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
export PI_CWD="$TMP/work"; mkdir -p "$PI_CWD"
REG="$PI_RUNS_DIR/agents"

# Stub pi: emits a session line + a clean agent_end. On --session (resume) the reply
# text differs, so the send/resume path is distinguishable from a fresh run.
mkdir -p "$TMP/bin"
cat > "$TMP/bin/pi" <<'EOF'
#!/usr/bin/env bash
resumed=no; brief=""
for a in "$@"; do [ "$a" = "--session" ] && resumed=yes; case "$a" in @*) brief="${a#@}";; esac; done
echo '{"type":"session","id":"sess-stub"}'
# Brief-driven behaviors for the watch quota-abort test.
if grep -q SLOW_BRIEF "$brief" 2>/dev/null; then sleep 30; fi
if grep -q QUOTA_BRIEF "$brief" 2>/dev/null; then
  echo '{"type":"agent_end","messages":[{"stopReason":"error","errorMessage":"Codex error: The usage limit has been reached"}]}'
  exit 0
fi
[ "$resumed" = yes ] && txt="resumed reply" || txt="first reply"
echo "{\"type\":\"agent_end\",\"messages\":[{\"stopReason\":\"stop\",\"content\":[{\"type\":\"text\",\"text\":\"$txt\"}]}]}"
EOF
chmod +x "$TMP/bin/pi"
export PI_BIN="$TMP/bin/pi"

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
grep -q "resumed reply" "$DIR2/result.md" && ok "resume path hit (--session seen by stub)" || bad "resume path hit"

# --- ls: one line per agent, carrying its status; dangling links pruned ---
ln -sfn "$TMP/gone" "$REG/worker-b"
LS="$("$SCRIPTS/pi-agent.sh" ls)"
case "$LS" in *"worker-a STATUS=OK"*) ok "ls shows agent + status" ;; *) bad "ls agent line (got: $LS)" ;; esac
[ ! -e "$REG/worker-b" ] && ok "ls prunes dangling link" || bad "ls prunes dangling link"

# --- watch: emits lines, exits 0 with nothing in flight ---
W="$("$SCRIPTS/pi-agent.sh" watch 1 worker-a)"; RC=$?
[ "$RC" = 0 ] && ok "watch exits 0 when idle" || bad "watch exit rc=$RC"
case "$W" in *"worker-a: STATUS=OK"*) ok "watch emits per-agent state" ;; *) bad "watch per-agent state (got: $W)" ;; esac
case "$W" in *"no agents in flight"*) ok "watch terminal marker" ;; *) bad "watch terminal marker" ;; esac

# --- watch without NAMEs: refused. The registry is machine-wide, so an unscoped
#     watch would quota-abort another dispatch's workers ---
if "$SCRIPTS/pi-agent.sh" watch 1 >/dev/null 2>&1; then
  bad "watch without NAMEs must be refused"
else
  ok "watch without NAMEs is refused"
fi

# --- watch quota-abort: one worker hits the provider wall -> siblings IN THE
#     WATCHED SET are killed and stamped QUOTA sibling-abort (replayable on poll),
#     while an agent outside that set is left alone ---
"$SCRIPTS/pi-agent.sh" start slow-w "SLOW_BRIEF" >/dev/null
"$SCRIPTS/pi-agent.sh" start bystander-w "SLOW_BRIEF" >/dev/null
"$SCRIPTS/pi-agent.sh" start quota-w "QUOTA_BRIEF" >/dev/null
sleep 1
W="$(PI_STALL_THRESHOLD_S=100000 "$SCRIPTS/pi-agent.sh" watch 1 slow-w quota-w)"; RC=$?
case "$W" in *"quota-w: STATUS=FAIL"*QUOTA*) ok "watch surfaces QUOTA" ;; *) bad "watch surfaces QUOTA (got: $W)" ;; esac
# The stub's wall is "The usage limit has been reached" -> QUOTA-WINDOW, so the
# sibling stamp must carry that class too: a batch aborted by a resetting window
# is retryable later, and a plain QUOTA stamp would tell the caller it is not.
case "$W" in *"slow-w: STATUS=FAIL"*"QUOTA-WINDOW sibling-abort"*) ok "sibling abort carries the class the wall was reported with" ;; *) bad "watch sibling abort class (got: $W)" ;; esac
case "$W" in *bystander-w*) bad "watch reported on an agent it was not given: $W" ;; *) ok "watch ignores agents outside its set" ;; esac
[ "$RC" = 0 ] && ok "watch exits after quota abort" || bad "watch exit after quota abort rc=$RC"
L="$("$SCRIPTS/pi-agent.sh" poll slow-w)"
case "$L" in *"QUOTA-WINDOW sibling-abort"*) ok "sibling verdict replays on poll" ;; *) bad "sibling verdict replay (got: $L)" ;; esac
L="$(PI_STALL_THRESHOLD_S=100000 "$SCRIPTS/pi-agent.sh" poll bystander-w)"
case "$L" in RUNNING*) ok "unwatched agent survives another batch's quota abort" ;; *) bad "unwatched agent was killed by another batch (got: $L)" ;; esac
"$SCRIPTS/pi-agent.sh" stop slow-w >/dev/null; "$SCRIPTS/pi-agent.sh" stop quota-w >/dev/null
"$SCRIPTS/pi-agent.sh" stop bystander-w >/dev/null

# --- stop: unregisters ---
"$SCRIPTS/pi-agent.sh" stop worker-a >/dev/null
[ ! -e "$REG/worker-a" ] && ok "stop unregisters NAME" || bad "stop unregisters NAME"

# --- unknown NAME: non-zero ---
if "$SCRIPTS/pi-agent.sh" poll nope >/dev/null 2>&1; then
  bad "unknown NAME fails"
else
  ok "unknown NAME fails"
fi

echo "---"
echo "pass=$PASS fail=$FAIL"
[ "$FAIL" = 0 ]
