#!/usr/bin/env bash
# A re-launched shard must not read the previous round's artifacts.
#
# cf.md §3.5 re-runs cf-pi-run.sh on the same session directory after an
# infrastructure FAIL. Left in place, last round's files are read as this
# round's:
#   - outcome.md  : cf-pi-watch.sh declares the shard finished (with the stale
#                   status) before the retry has started
#   - escalate.md : the escalation step short-circuits into NEEDS_REPLAN
#   - report      : gate 1 passes on stale contract claims
#   - pi-rundir   : a failure BEFORE dispatch reports last round's session JSONL
#                   and errorMessage as this round's cause
#
# All sibling cf-pi-*.sh scripts (and `sleep`/`git`) are stubbed; the real
# cf-pi-run.sh under scripts/ is the unit under test.

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

# build_fixture MODE  (MODE: reports | silent | probe-fails | worktree-fails)
# Every mode starts from a session directory full of last round's artifacts.
# Sets: FLOW, SHARD, STUBS
build_fixture() {
  local mode="$1"
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

  # --- previous round's leftovers, all of which would misroute this round ---
  cat > "$SHARD/outcome.md" <<'EOF'
## Status
FAIL

## Reason
stall
EOF
  cat > "$SHARD/escalate.md" <<'EOF'
## Blocker
Last round's blocker.
EOF
  cat > "$SHARD/implement-report.md" <<'EOF'
## Summary
Last round's report.

## Completed
- Stale claim _(contract: C_GONE)_
EOF
  mkdir -p "$FLOW/last-round/sessions"
  printf '{"errorMessage":"last round exploded"}\n' > "$FLOW/last-round/sessions/old.jsonl"
  printf '%s\n' "$FLOW/last-round" > "$SHARD/pi-rundir"

  for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
  done
  if [ "$mode" = worktree-fails ]; then
    printf '#!/bin/bash\necho "worktree add failed" >&2\nexit 1\n' > "$STUBS/cf-pi-worktree.sh"
  fi
  printf '#!/bin/bash\necho "pm"\n' > "$STUBS/cf-pi-postmortem.sh"
  printf '#!/bin/bash\necho "test_exit=0"\nexit 0\n' > "$STUBS/cf-pi-test.sh"
  printf '#!/bin/bash\necho "STATUS=OK"\n' > "$STUBS/cf-pi-poll.sh"

  if [ "$mode" = probe-fails ]; then
    printf '#!/bin/bash\necho "ERROR:this round exploded"\n' > "$STUBS/cf-pi-probe.sh"
  else
    printf '#!/bin/bash\necho OK\n' > "$STUBS/cf-pi-probe.sh"
  fi

  # The worker records whether the stale outcome.md was still on disk when it
  # started: the clear must happen BEFORE dispatch, or cf-pi-watch.sh reads the
  # shard as already finished while the retry is still running. In `silent` mode
  # it writes nothing at all, so gate 1 has only the stale report to go on.
  cat > "$STUBS/cf-pi-dispatch.sh" <<EOF
#!/bin/bash
[ -e "$SHARD/outcome.md" ] && echo stale >> "$FLOW/stale-at-dispatch"
if [ "$mode" = reports ]; then
  cat > "$SHARD/implement-report.md" <<'REPORT'
## Summary
This round's report.

## Completed
- Implemented the thing _(contract: C1)_
REPORT
fi
echo 12345
EOF

  printf '#!/bin/bash\nexit 0\n' > "$STUBS/sleep"
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/git"
  chmod +x "$STUBS"/*
}

# ---- scenario 1: this round succeeds -> its own PASS, none of the leftovers ----

build_fixture reports
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "0" "$rc" "re-run exits 0 (stale escalate.md did not force NEEDS_REPLAN)"
stale_at_dispatch=0
[ -f "$FLOW/stale-at-dispatch" ] && stale_at_dispatch=$(wc -l < "$FLOW/stale-at-dispatch" | tr -d ' ')
assert_eq "0" "$stale_at_dispatch" \
  "stale outcome.md is already gone when the worker is dispatched"
assert_contains "$(head -2 "$SHARD/outcome.md" | tr '\n' ' ')" "PASS" \
  "outcome.md is this round's PASS, not last round's FAIL"
assert_contains "$(cat "$SHARD/outcome.md")" "C1" \
  "survivors come from this round's report"
assert_eq "0" "$(grep -c 'C_GONE' "$SHARD/outcome.md" || true)" \
  "stale report's contract claim does not survive into the outcome"
rm -rf "$FLOW"

# ---- scenario 2: worker writes no report -> stale report cannot carry gate 1 ----

build_fixture silent
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "1" "$rc" "silent: cf-pi-run exits 1 — last round's report does not pass gate 1"
assert_contains "$(cat "$SHARD/outcome.md")" "report-malformed" \
  "silent: outcome Reason is report-malformed"
assert_eq "0" "$(grep -c 'C_GONE' "$SHARD/outcome.md" || true)" \
  "silent: no contract is credited from the stale report"
rm -rf "$FLOW"

# ---- scenario 3: failure before dispatch -> cause is this round's, not last's ----

build_fixture probe-fails
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "1" "$rc" "probe-fails: cf-pi-run exits 1"
assert_eq "0" "$(grep -c 'last round exploded' "$SHARD/outcome.md" || true)" \
  "probe-fails: last round's errorMessage is not reported as this round's cause"
assert_contains "$(cat "$SHARD/outcome.md")" "session_jsonl: -" \
  "probe-fails: no session JSONL is claimed for a round that never dispatched"
rm -rf "$FLOW"

# ---- scenario 4: abort before any gate -> an outcome is still written ----
# Step 0 removed the previous round's outcome, so nothing masks an early abort:
# without an outcome file cf-pi-watch.sh waits forever on a shard that is gone.

build_fixture worktree-fails
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "1" "$rc" "worktree-fails: cf-pi-run exits 1"
assert_contains "$(cat "$SHARD/outcome.md" 2>/dev/null)" "outcome-missing" \
  "worktree-fails: an abort before any gate still writes an outcome for the watcher"
rm -rf "$FLOW"
