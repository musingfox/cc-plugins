#!/usr/bin/env bash
# The gate reports what the suite said it ran, not just its exit code.
#
# An exit code cannot tell a green suite from one that skipped everything and
# exited 0 — both look identical to every gate in the flow. The counts are
# quoted from the runner's own summary line rather than computed, because a
# per-runner parser is wrong for the next runner; when there is no count-shaped
# line the marker says so instead of inventing one.
#
#   - a runner that prints a summary  -> test_counts= quotes it
#   - a silent runner                 -> test_counts=unparsed
#   - an all-skipped green suite      -> counts show the skips, exit code does not
#   - cf-pi-run.sh carries the counts into outcome.md and warns on `unparsed`

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
TESTSH="$REAL_SCRIPTS/cf-pi-test.sh"

new_session() {
  local s; s="$(mktemp -d)"
  mkdir -p "$s/work"
  printf 'SESSION="%s"\nSESSION_BASENAME="test-shard-A"\n' "$s" > "$s/env.sh"
  printf '%s' "$s"
}

counts_of() { sed -n 's/^test_counts=//p' <<<"$1" | tail -1; }

# ---- a runner that prints a summary: the numbers are quoted back ----

S="$(new_session)"
out="$(bash "$TESTSH" "$S" bash -c 'echo "Tests: 24 passed, 0 failed"')"
assert_contains "$(counts_of "$out")" "24 passed" "summary: passes are quoted"
rm -rf "$S"

S="$(new_session)"
out="$(bash "$TESTSH" "$S" bash -c 'echo "  10 passing"; echo "  2 pending"')"
c="$(counts_of "$out")"
assert_contains "$c" "10 passing" "mocha shape: passes are quoted"
assert_contains "$c" "2 pending" "mocha shape: pendings are quoted"
rm -rf "$S"

# ---- the case the exit code cannot see: everything skipped, exit 0 ----

S="$(new_session)"
out="$(bash "$TESTSH" "$S" bash -c 'echo "0 passed, 600 skipped"; exit 0')"
assert_contains "$out" "test_exit=0" "all-skipped: the exit code still says green"
c="$(counts_of "$out")"
assert_contains "$c" "600 skipped" "all-skipped: the counts show what the exit code hides"
assert_contains "$c" "0 passed" "all-skipped: zero passes are visible"
rm -rf "$S"

# ---- a runner that prints no counts says so, it does not invent any ----

S="$(new_session)"
out="$(bash "$TESTSH" "$S" bash -c 'echo "build complete"; exit 0')"
assert_eq "unparsed" "$(counts_of "$out")" "silent runner: reports unparsed"
rm -rf "$S"

# ---- cf-pi-run.sh carries the counts into the outcome and warns on unparsed ----

run_shard() { # $1 = the gate stub's stdout -> echoes FLOW dir
  local gate_out="$1" FLOW SHARD STUBS
  FLOW="$(mktemp -d)"; SHARD="$FLOW/shards/A"; STUBS="$FLOW/stubs"
  mkdir -p "$SHARD" "$STUBS"
  printf '{"groups": {"A": {"contracts": ["C1"], "files": ["src/x.ts"]}}}\n' > "$FLOW/shards.json"
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
  for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh cf-pi-scope.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
  done
  printf '#!/bin/bash\necho OK\n' > "$STUBS/cf-pi-probe.sh"
  printf '#!/bin/bash\necho "pm"\n' > "$STUBS/cf-pi-postmortem.sh"
  cat > "$STUBS/cf-pi-dispatch.sh" <<EOF
#!/bin/bash
cat > "$SHARD/implement-report.md" <<'REPORT'
## Summary
Did the work.

## Completed
- Implemented the thing _(contract: C1)_
REPORT
echo 12345
EOF
  printf '#!/bin/bash\necho "STATUS=OK"\n' > "$STUBS/cf-pi-poll.sh"
  printf '#!/bin/bash\n%s\nexit 0\n' "$gate_out" > "$STUBS/cf-pi-test.sh"
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/sleep"
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/git"
  chmod +x "$STUBS"/*
  PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
    > "$FLOW/run.log" 2>&1
  printf '%s' "$FLOW"
}

F="$(run_shard 'echo "test_exit=0"; echo "test_counts=24 passed 0 failed"')"
assert_contains "$(cat "$F/shards/A/outcome.md")" "24 passed" \
  "outcome: the counts reach the artifact the orchestrator reads"
assert_contains "$(cat "$F/run.log")" "gate 3 ok (24 passed" \
  "progress: the counts are said out loud on green"
rm -rf "$F"

F="$(run_shard 'echo "test_exit=0"; echo "test_counts=unparsed"')"
assert_contains "$(cat "$F/run.log")" "WARNING: no test counts" \
  "progress: a green gate with no counts is called out, not passed over in silence"
assert_contains "$(cat "$F/shards/A/outcome.md")" "unparsed" \
  "outcome: unparsed is recorded rather than left blank"
rm -rf "$F"
