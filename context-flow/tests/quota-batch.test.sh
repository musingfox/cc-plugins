#!/usr/bin/env bash
# A quota wall ends the shard, and the batch stops paying for it.
#
# A worker that dies on a provider spend wall carries a QUOTA or QUOTA-WINDOW
# tag on its cf-pi-poll.sh line. Retrying on the same routing only pays again,
# so the shard ends as FAIL with the tag as its Reason and is never dispatched
# again.
#
# All sibling cf-pi-*.sh scripts (and `sleep`/`git`) are stubbed; the real
# cf-pi-run.sh under scripts/ is the unit under test.

CF_TESTS_DIR="${CF_TESTS_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

# build_fixture SHARD_ID POLL_BODY [PROBE_BODY]
# POLL_BODY runs inside the poll stub after it counts itself; $r is the 1-based
# poll round. The dispatch stub never writes a report. Sets: FLOW, SHARD, STUBS
build_fixture() {
  local sid="$1" poll_body="$2" probe_body="${3:-}"
  FLOW="$(mktemp -d)"
  SHARD="$FLOW/shards/$sid"
  STUBS="$FLOW/stubs"
  mkdir -p "$SHARD" "$STUBS"

  cat > "$FLOW/shards.json" <<JSON
{"groups": {"$sid": {"contracts": ["C1"], "files": ["src/x.ts"]}}}
JSON

  cat > "$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-shard-$sid"
PLUGIN_ROOT="$FLOW"
SCRIPTS="$STUBS"
FLOW_SESSION="$FLOW"
SHARD_ID="$sid"
PI_DISPATCH_CMD=""
PI_STALL_THRESHOLD_S=180
PI_WALL_CLOCK_S=1800
REPO_ROOT="$FLOW"
BASE_BRANCH="main"
BASE_HEAD="HEAD"
EOF

  for s in cf-pi-worktree.sh cf-pi-brief.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
  done
  printf '#!/bin/bash\necho "$*" >> "%s/stop.log"\n' "$FLOW" > "$STUBS/cf-pi-stop.sh"
  printf '#!/bin/bash\necho "pm"\n' > "$STUBS/cf-pi-postmortem.sh"
  printf '#!/bin/bash\necho "test_exit=0"\nexit 0\n' > "$STUBS/cf-pi-test.sh"
  printf '#!/bin/bash\n%s\necho OK\n' "$probe_body" > "$STUBS/cf-pi-probe.sh"
  cat > "$STUBS/cf-pi-poll.sh" <<EOF
#!/bin/bash
echo 1 >> "$FLOW/poll.count"
r=\$(wc -l < "$FLOW/poll.count" | tr -d ' ')
$poll_body
EOF
  cat > "$STUBS/cf-pi-dispatch.sh" <<EOF
#!/bin/bash
echo 1 >> "$FLOW/dispatch.count"
echo 12345
EOF

  printf '#!/bin/bash\nexit 0\n' > "$STUBS/sleep"
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/git"
  chmod +x "$STUBS"/*
}

run_shard() {
  PATH="$STUBS:$PATH" PI_RUNS_DIR="${PI_RUNS_DIR:-$FLOW/pi-runs}" \
    bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" > "$FLOW/run.log" 2>&1
}

# section NAME: the line after `## NAME` in outcome.md
section() { sed -n "/^## $1\$/{n;p;q;}" "$SHARD/outcome.md" 2>/dev/null; }

count_of() { if [ -f "$1" ]; then wc -l < "$1" | tr -d ' '; else echo 0; fi; }

# reason_for POLL_LINE: the Reason a shard ends with when its first poll prints POLL_LINE
reason_for() {
  build_fixture A "echo '$1'"
  run_shard
  section Reason
  rm -rf "$FLOW"
}

# ---- the worker's own quota wall ends the shard ----

build_fixture A "echo 'STATUS=FAIL OUTPUT=/r/result.md exit rc=1 QUOTA 5s cause:insufficient quota'"
run_shard; rc=$?
assert_eq "1" "$rc" "quota: the shard exits 1"
assert_eq "FAIL" "$(section Status)" "quota: Status is FAIL"
assert_eq "QUOTA" "$(section Reason)" "quota: Reason is the tag, not rc-fail"
assert_eq "1" "$(count_of "$FLOW/dispatch.count")" "quota: no further dispatch"
assert_contains "$(cat "$FLOW/stop.log" 2>/dev/null)" "--abort" "quota: the worker is stopped"
rm -rf "$FLOW"

assert_eq "QUOTA-WINDOW" "$(reason_for 'STATUS=FAIL OUTPUT=/r/result.md ERROR QUOTA-WINDOW terminal=error 5s')" \
  "quota-window: the window tag is kept, not collapsed to QUOTA or error"
assert_eq "QUOTA" "$(reason_for 'STATUS=FAIL OUTPUT=/r/result.md QUOTA killed 5s')" \
  "quota killed: Reason is QUOTA"
assert_eq "error" "$(reason_for 'STATUS=FAIL OUTPUT=/r/result.md ERROR terminal=error 5s cause:rate limit 429')" \
  "rate limit: an untagged error keeps its error reason"
assert_eq "timeout" "$(reason_for 'STATUS=FAIL OUTPUT=/QUOTA/result.md TIMEOUT 1800s')" \
  "path: QUOTA inside the OUTPUT= path is not a tag"

# ---- the wall is recorded where every sibling in the batch can see it ----

# field KEY: the value of KEY= in the batch's quota-wall marker
field() { sed -n "s/^$1=//p" "$FLOW/quota-wall" 2>/dev/null; }

# no_temp_left LABEL: the atomic write leaves no quota-wall.* behind
no_temp_left() {
  assert_eq "0" "$(find "$FLOW" -maxdepth 1 -name 'quota-wall.*' | wc -l | tr -d ' ')" \
    "$1: no quota-wall temp file remains"
}

build_fixture A "echo 'STATUS=FAIL OUTPUT=/r/result.md exit rc=1 QUOTA 5s cause:insufficient quota'"
before=$(date +%s)
run_shard
assert_eq "QUOTA" "$(field TAG)" "record: the marker carries the tag"
assert_eq "A" "$(field SHARD)" "record: the marker names the shard that hit the wall"
epoch=$(field EPOCH)
assert_eq "yes" "$([ "${epoch:-0}" -ge "$before" ] 2>/dev/null && echo yes || echo no)" \
  "record: the marker's EPOCH ($epoch) is no earlier than the run's start ($before)"
no_temp_left "record"
rm -rf "$FLOW"

build_fixture A "printf 'TAG=QUOTA\nSHARD=B\nEPOCH=%s\n' \"\$(date +%s)\" > \"\$(dirname \"\$0\")/../quota-wall\"
echo 'STATUS=FAIL OUTPUT=/r/result.md ERROR QUOTA-WINDOW terminal=error 5s'"
run_shard
assert_eq "QUOTA" "$(field TAG)" "precedence: a QUOTA-WINDOW does not replace a QUOTA recorded this run"
assert_eq "B" "$(field SHARD)" "precedence: the QUOTA marker keeps its shard"
assert_eq "QUOTA-WINDOW" "$(section Reason)" "precedence: the shard still ends with its own tag"
no_temp_left "precedence"
rm -rf "$FLOW"

build_fixture A "echo 'STATUS=FAIL OUTPUT=/r/result.md ERROR QUOTA-WINDOW terminal=error 5s'"
printf 'TAG=QUOTA\nSHARD=B\nEPOCH=1\n' > "$FLOW/quota-wall"
run_shard
assert_eq "QUOTA-WINDOW" "$(field TAG)" "stale: a wall from before this run is replaced"
assert_eq "A" "$(field SHARD)" "stale: the replaced marker names this shard"
no_temp_left "stale"
rm -rf "$FLOW"

build_fixture A "echo 'STATUS=FAIL OUTPUT=/r/result.md ERROR terminal=error 5s cause:rate limit 429'"
run_shard
assert_eq "no" "$([ -e "$FLOW/quota-wall" ] && echo yes || echo no)" \
  "rate limit: an untagged failure records no wall"
no_temp_left "rate limit"
rm -rf "$FLOW"

build_fixture A "echo 'STATUS=FAIL OUTPUT=/r/result.md exit rc=1 QUOTA 5s cause:insufficient quota'"
mkdir "$FLOW/ro"
cp "$FLOW/shards.json" "$FLOW/ro/"
chmod 555 "$FLOW/ro"
printf 'FLOW_SESSION="%s"\n' "$FLOW/ro" >> "$SHARD/env.sh"
run_shard; rc=$?
assert_contains "$(cat "$FLOW/run.log")" "quota wall QUOTA not recorded" \
  "unwritable: the task log says the wall was not recorded"
assert_eq "QUOTA" "$(section Reason)" "unwritable: the shard still ends with the tag"
assert_eq "1" "$rc" "unwritable: the shard exits 1"
chmod 755 "$FLOW/ro"
rm -rf "$FLOW"

# ---- a still-running sibling stops on the recorded wall ----

# sibling_poll TAG: round 1 records TAG as hit by shard A, and B's worker is still running
sibling_poll() {
  printf '%s' "if [ \"\$r\" -eq 1 ]; then printf 'TAG=$1\nSHARD=A\nEPOCH=%s\n' \"\$(date +%s)\" > \"\$(dirname \"\$0\")/../quota-wall\"; fi
echo 'RUNNING 30s'"
}

build_fixture B "$(sibling_poll QUOTA)"
run_shard; rc=$?
assert_eq "1" "$rc" "sibling: the shard exits 1"
assert_eq "QUOTA" "$(section Reason)" "sibling: Reason is the wall's tag"
assert_contains "$(cat "$SHARD/outcome.md")" "(all): QUOTA sibling-abort (wall hit by shard A)" \
  "sibling: Affected names the shard that hit the wall"
assert_contains "$(section Cause)" "wall hit by shard A" "sibling: Cause names the shard that hit the wall"
assert_contains "$(cat "$FLOW/stop.log" 2>/dev/null)" "--abort" "sibling: the running worker is stopped"
assert_eq "1" "$(count_of "$FLOW/dispatch.count")" "sibling: no further dispatch"
rm -rf "$FLOW"

build_fixture B "$(sibling_poll QUOTA-WINDOW)"
run_shard
assert_eq "QUOTA-WINDOW" "$(section Reason)" "sibling window: Reason is the window tag"
rm -rf "$FLOW"

build_fixture B "if [ \"\$r\" -eq 1 ]; then echo 'RUNNING 30s'; else echo 'STATUS=FAIL OUTPUT=/r/result.md TIMEOUT 1800s'; fi"
printf 'TAG=QUOTA\nSHARD=A\nEPOCH=1\n' > "$FLOW/quota-wall"
run_shard
assert_eq "timeout" "$(section Reason)" "sibling stale: a wall from before this run does not stop the worker"
rm -rf "$FLOW"

# ---- no dispatch, first or re-brief, into a recorded wall ----

# write_wall EPOCH_EXPR: a shell line that records a QUOTA wall hit by shard A
write_wall() {
  printf '%s' "printf 'TAG=QUOTA\nSHARD=A\nEPOCH=%s\n' \"$1\" > \"\$(dirname \"\$0\")/../quota-wall\""
}

build_fixture B "$(write_wall '$(date +%s)'); echo STATUS=OK"
run_shard; rc=$?
assert_eq "1" "$(count_of "$FLOW/dispatch.count")" "re-brief: the gate-1 re-brief is not dispatched"
assert_eq "QUOTA" "$(section Reason)" "re-brief: Reason is the wall's tag"
assert_eq "1" "$rc" "re-brief: the shard exits 1"
assert_contains "$(cat "$SHARD/outcome.md")" "(all): QUOTA sibling-abort (wall hit by shard A)" \
  "re-brief: Affected names the shard that hit the wall"
rm -rf "$FLOW"

build_fixture B "echo STATUS=OK" "$(write_wall '$(date +%s)')"
run_shard; rc=$?
assert_eq "0" "$(count_of "$FLOW/dispatch.count")" "first dispatch: nothing is dispatched into a recorded wall"
assert_eq "QUOTA" "$(section Reason)" "first dispatch: Reason is the wall's tag"
assert_eq "1" "$rc" "first dispatch: the shard exits 1"
rm -rf "$FLOW"

build_fixture B "echo STATUS=OK" "$(write_wall 1)"
run_shard
assert_eq "yes" "$([ "$(count_of "$FLOW/dispatch.count")" -ge 1 ] && echo yes || echo no)" \
  "stale: a wall from before this run does not block the first dispatch"
rm -rf "$FLOW"
