#!/usr/bin/env bash
# The gate-3 test runner is bounded: stdin is /dev/null and the command has a
# deadline. Without both, a suite that reads stdin or spins hangs cf-pi-run.sh
# forever — nothing downstream bounds it, so the only backstop was the
# orchestrator's one-hour Monitor while the shard looked like it was working.
#
#   - a command that reads stdin gets EOF instead of blocking
#   - a command that outruns CF_TEST_DEADLINE_S is killed, reported as
#     test_stalled=, and exits 124 with no test_exit= marker
#   - the whole process tree dies with it, not just the top process
#   - cf-pi-run.sh routes test_stalled as FAIL test-stalled without spending a
#     re-dispatch on it, on EVERY gate-3 run: the first, the cheap retest, and
#     the post-re-dispatch retry. A stall reaching the retry path would be
#     reported as test-fail-persistent and cost a whole Plan round.

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
TESTSH="$REAL_SCRIPTS/cf-pi-test.sh"

new_session() { # -> echoes a session dir with the env cf-pi-test.sh needs
  local s; s="$(mktemp -d)"
  mkdir -p "$s/work"
  cat > "$s/env.sh" <<EOF
SESSION="$s"
SESSION_BASENAME="test-shard-A"
EOF
  printf '%s' "$s"
}

# ---- stdin is /dev/null, not the caller's terminal ----

S="$(new_session)"
out="$(bash "$TESTSH" "$S" bash -c 'read -r line; echo "read rc=$?"' 2>&1)"
rc=$?
assert_eq "0" "$rc" "stdin: a command that reads stdin still exits"
assert_contains "$out" "test_exit=" "stdin: the exit marker is still printed"
rm -rf "$S"

# ---- a command that outruns the deadline is killed and reported as stalled ----

S="$(new_session)"
start=$(date +%s)
out="$(CF_TEST_DEADLINE_S=1 bash "$TESTSH" "$S" sleep 30 2>&1)"
rc=$?
elapsed=$(( $(date +%s) - start ))
assert_eq "124" "$rc" "deadline: a runner past its deadline exits 124"
assert_contains "$out" "test_stalled=1" "deadline: the stall marker names the deadline"
verdict=late; [ "$elapsed" -lt 15 ] && verdict=prompt
assert_eq "prompt" "$verdict" \
  "deadline: killed near the deadline, not after the command's own run (${elapsed}s)"
marker=absent; case "$out" in *test_exit=*) marker=present ;; esac
assert_eq "absent" "$marker" "deadline: a stall is not a red suite, so no test_exit= marker"
rm -rf "$S"

# ---- the deadline kills the whole process tree, not just the top process ----

S="$(new_session)"
MARK="$S/grandchild-alive"
CF_TEST_DEADLINE_S=1 bash "$TESTSH" "$S" \
  bash -c "bash -c 'sleep 30; : > \"$MARK\"' & wait" >/dev/null 2>&1
sleep 4
grandchild=dead; [ -f "$MARK" ] && grandchild=alive
assert_eq "dead" "$grandchild" "tree kill: the whole process group went down with the deadline"
rm -rf "$S"

# ---- cf-pi-run.sh routes a stall as FAIL test-stalled, with no re-dispatch ----

# run_stall_flow GATE_BODY -> echoes the FLOW dir. GATE_BODY is the body of the
# stubbed cf-pi-test.sh; it may read "$FLOW/test.count" to behave differently on
# the first run, the retest, and the retry.
run_stall_flow() {
  local gate_body="$1" FLOW SHARD STUBS
  FLOW="$(mktemp -d)"
  SHARD="$FLOW/shards/A"
  STUBS="$FLOW/stubs"
  mkdir -p "$SHARD" "$STUBS"

  cat > "$FLOW/shards.json" <<'JSON'
{"groups": {"A": {"contracts": ["C1"], "files": ["src/x.ts"]}}}
JSON

  cat > "$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-shard-A"
PLUGIN_ROOT="$FLOW"
SCRIPTS="$STUBS"
FLOW_SESSION="$FLOW"
SHARD_ID="A"
PI_PROVIDER=""
PI_MODEL=""
PI_STALL_THRESHOLD_S=180
PI_WALL_CLOCK_S=1800
REPO_ROOT="$FLOW"
BASE_BRANCH="main"
BASE_HEAD="HEAD"
EOF

  local s
  for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh cf-pi-scope.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
  done
  printf '#!/bin/bash\necho OK\n' > "$STUBS/cf-pi-probe.sh"
  printf '#!/bin/bash\necho "pm"\n' > "$STUBS/cf-pi-postmortem.sh"
  cat > "$STUBS/cf-pi-dispatch.sh" <<EOF
#!/bin/bash
echo 1 >> "$FLOW/dispatch.count"
cat > "$SHARD/implement-report.md" <<'REPORT'
## Summary
Did the work.

## Completed
- Implemented the thing _(contract: C1)_
REPORT
echo 12345
EOF
  printf '#!/bin/bash\necho "STATUS=OK"\n' > "$STUBS/cf-pi-poll.sh"
  cat > "$STUBS/cf-pi-test.sh" <<EOF
#!/bin/bash
FLOW="$FLOW"
echo 1 >> "\$FLOW/test.count"
$gate_body
EOF
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/sleep"
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/git"
  chmod +x "$STUBS"/*

  PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
    > "$FLOW/run.log" 2>&1
  printf '%s' "$FLOW"
}

FLOW="$(run_stall_flow 'echo "test_stalled=1800"; exit 124')"
assert_contains "$(head -8 "$FLOW/shards/A/outcome.md" | tr '\n' ' ')" "test-stalled" \
  "stall routing: outcome Reason is test-stalled"
assert_eq "1" "$(wc -l < "$FLOW/test.count" | tr -d ' ')" \
  "stall routing: the gate ran once, no retest"
assert_eq "1" "$(wc -l < "$FLOW/dispatch.count" | tr -d ' ')" \
  "stall routing: no re-dispatch spent on a suite that never returns"
rm -rf "$FLOW"

# ---- a stall on the retest is still a stall, not a reason to re-dispatch ----
# The first run fails red, so the cheap retest runs; that one hangs. Without the
# guard on the retest output, TEST_RC keeps the first run's code and the script
# spends a full dispatch+poll on a suite that never returns.

FLOW="$(run_stall_flow 'if [ -f "$FLOW/test.count" ] && [ "$(wc -l < "$FLOW/test.count")" -ge 2 ]; then echo "test_stalled=1800"; exit 124; fi; echo "test_exit=1"; exit 1')"
assert_contains "$(head -8 "$FLOW/shards/A/outcome.md" | tr '\n' ' ')" "test-stalled" \
  "retest stall: outcome Reason is test-stalled, not a red suite"
assert_eq "1" "$(wc -l < "$FLOW/dispatch.count" | tr -d ' ')" \
  "retest stall: no re-dispatch spent on a suite that never returns"
rm -rf "$FLOW"

# ---- a stall on the retry is a stall, not test-fail-persistent ----
# Here the re-dispatch has already happened, so the run is genuinely at the
# retry. Calling that NEEDS_REPLAN blames every contract in the shard and buys a
# Plan round for a test that never finished.

FLOW="$(run_stall_flow 'if [ -f "$FLOW/test.count" ] && [ "$(wc -l < "$FLOW/test.count")" -ge 3 ]; then echo "test_stalled=1800"; exit 124; fi; echo "test_exit=1"; exit 1')"
head8="$(head -8 "$FLOW/shards/A/outcome.md" | tr '\n' ' ')"
assert_contains "$head8" "test-stalled" "retry stall: outcome Reason is test-stalled"
verdict=clean; case "$head8" in *test-fail-persistent*) verdict=misrouted ;; esac
assert_eq "clean" "$verdict" "retry stall: never reported as a persistent test failure"
rm -rf "$FLOW"
