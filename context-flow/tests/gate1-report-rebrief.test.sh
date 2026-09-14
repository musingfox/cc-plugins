#!/usr/bin/env bash
# Gate-1 report-only re-dispatch in cf-pi-run.sh.
#
# A worker that did the work but skipped (or malformed) implement-report.md used
# to FAIL the shard outright, even with every deterministic gate green. The
# report is still required — it is the only contract<->commit channel — so
# cf-pi-run.sh asks for the report alone on the resumed session before failing:
#   - writes it on the retry : PASS, 2 dispatches
#   - never writes it        : FAIL report-malformed, 2 dispatches (not a loop)
#   - escalates instead      : NEEDS_REPLAN escalate, not FAIL
#
# All sibling cf-pi-*.sh scripts (and `sleep`/`git`) are stubbed; the real
# cf-pi-run.sh under scripts/ is the unit under test.

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

# build_fixture MODE  (MODE: recovers | never)
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

  for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
  done
  printf '#!/bin/bash\necho OK\n' > "$STUBS/cf-pi-probe.sh"
  printf '#!/bin/bash\necho "pm"\n' > "$STUBS/cf-pi-postmortem.sh"
  printf '#!/bin/bash\necho "test_exit=0"\nexit 0\n' > "$STUBS/cf-pi-test.sh"
  printf '#!/bin/bash\necho "STATUS=OK"\n' > "$STUBS/cf-pi-poll.sh"

  # First dispatch always leaves the report missing. In `recovers` mode the
  # second one (the report-only re-brief) writes it.
  cat > "$STUBS/cf-pi-dispatch.sh" <<EOF
#!/bin/bash
echo 1 >> "$FLOW/dispatch.count"
n=\$(wc -l < "$FLOW/dispatch.count")
if [ "$mode" = escalates ] && [ "\$n" -ge 2 ]; then
  cat > "$SHARD/escalate.md" <<'ESC'
## Blocker
Cannot report what was never specified.
ESC
fi
if [ "$mode" = recovers ] && [ "\$n" -ge 2 ]; then
  cat > "$SHARD/implement-report.md" <<'REPORT'
## Summary
Wrote the report the orchestrator asked for.

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

count_of() { wc -l < "$1" 2>/dev/null | tr -d ' ' || echo 0; }

# ---- scenario 1: report written on the re-brief -> PASS ----

build_fixture recovers
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "0" "$rc" "recovers: cf-pi-run exits 0"
assert_contains "$(head -2 "$SHARD/outcome.md" | tr '\n' ' ')" "PASS" \
  "recovers: outcome Status is PASS"
assert_eq "2" "$(count_of "$FLOW/dispatch.count")" "recovers: exactly 2 dispatches"
assert_contains "$(cat "$SHARD/implement-brief.md")" "Missing report" \
  "recovers: the report request is appended to the brief for the fresh-dispatch fallback"
assert_contains "$(cat "$SHARD/report-re-brief.md")" "must NOT be redone" \
  "recovers: the re-brief asks for the report only, not a re-implementation"
rm -rf "$FLOW"

# ---- scenario 2: report never written -> FAIL report-malformed, no loop ----

build_fixture never
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "1" "$rc" "never: cf-pi-run exits 1 (FAIL)"
assert_contains "$(cat "$SHARD/outcome.md")" "report-malformed" \
  "never: outcome Reason is report-malformed"
assert_eq "2" "$(count_of "$FLOW/dispatch.count")" "never: exactly 2 dispatches (one retry, then fail)"
rm -rf "$FLOW"

# ---- scenario 3: worker escalates on the re-brief -> NEEDS_REPLAN, blocker kept ----

build_fixture escalates
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "2" "$rc" "escalates: cf-pi-run exits 2 (NEEDS_REPLAN, not FAIL)"
assert_contains "$(cat "$SHARD/outcome.md")" "escalate" \
  "escalates: outcome Reason is escalate, so Plan gets the blocker instead of an infra re-launch"
rm -rf "$FLOW"
