#!/usr/bin/env bash
# Gate-3 retest-before-redispatch behavior of cf-pi-run.sh.
#
# A first gate-3 failure is often an environment transient (parallel shards
# colliding on a shared port/service). cf-pi-run.sh must retest once before the
# expensive OMP re-dispatch:
#   - transient  : test fails, retest passes  -> PASS, exactly 1 dispatch
#   - persistent : test fails twice           -> re-dispatch once, retry fails
#                                                -> NEEDS_REPLAN, 2 dispatches
#   - escalates-on-fix : the worker escalates on the fix re-brief
#                                                -> NEEDS_REPLAN escalate,
#                                                   survivors preserved
#
# All sibling cf-pi-*.sh scripts (and `sleep`/`git`) are stubbed; the real
# cf-pi-run.sh under scripts/ is the unit under test.

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

# build_fixture MODE  (MODE: transient | persistent | escalates-on-fix)
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
# In the real flow cf-pi-worktree.sh appends these; the stub doesn't.
REPO_ROOT="$FLOW"
BASE_BRANCH="main"
BASE_HEAD="HEAD"
EOF

  # Lifecycle stubs: trivially succeed, count dispatches.
  for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh; do
    printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
  done
  printf '#!/bin/bash\necho OK\n' > "$STUBS/cf-pi-probe.sh"
  printf '#!/bin/bash\necho "pm"\n' > "$STUBS/cf-pi-postmortem.sh"
  # Dispatch counts itself and writes the worker's report (cf-pi-run.sh clears
  # the previous round's copy before dispatching, so it cannot be pre-seeded):
  # gate 1 must pass and C1 register as survivor.
  cat > "$STUBS/cf-pi-dispatch.sh" <<EOF
#!/bin/bash
echo 1 >> "$FLOW/dispatch.count"
n=\$(wc -l < "$FLOW/dispatch.count")
if [ "$mode" = escalates-on-fix ] && [ "\$n" -ge 2 ]; then
  cat > "$SHARD/escalate.md" <<'ESC'
## Blocker
The failing test contradicts the contract.
ESC
fi
cat > "$SHARD/implement-report.md" <<'REPORT'
## Summary
Did the work.

## Completed
- Implemented the thing _(contract: C1)_
REPORT
echo 12345
EOF
  printf '#!/bin/bash\necho "STATUS=OK"\n' > "$STUBS/cf-pi-poll.sh"

  # Test stub: counts invocations; behavior per scenario.
  if [ "$mode" = transient ]; then
    cat > "$STUBS/cf-pi-test.sh" <<EOF
#!/bin/bash
echo 1 >> "$FLOW/test.count"
n=\$(wc -l < "$FLOW/test.count")
echo "test_exit=1"
[ "\$n" -ge 2 ] && exit 0
exit 1
EOF
  else
    cat > "$STUBS/cf-pi-test.sh" <<EOF
#!/bin/bash
echo 1 >> "$FLOW/test.count"
echo "test_exit=1"
exit 1
EOF
  fi

  # PATH stubs so the poll loop's sleep is instant and git never fails the run.
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/sleep"
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/git"
  chmod +x "$STUBS"/*
}

count_of() { wc -l < "$1" 2>/dev/null | tr -d ' ' || echo 0; }

# ---- scenario 1: transient failure -> retest passes -> PASS, no re-dispatch ----

build_fixture transient
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "0" "$rc" "transient: cf-pi-run exits 0"
assert_contains "$(cat "$FLOW/run.log")" "environment transient" \
  "transient: run log says the retest classified it"
assert_contains "$(head -2 "$SHARD/outcome.md" | tr '\n' ' ')" "PASS" \
  "transient: outcome Status is PASS"
assert_eq "1" "$(count_of "$FLOW/dispatch.count")" "transient: exactly 1 dispatch (no re-dispatch)"
assert_eq "2" "$(count_of "$FLOW/test.count")" "transient: test ran twice (first + retest)"
rm -rf "$FLOW"

# ---- scenario 2: persistent failure -> one re-dispatch -> NEEDS_REPLAN ----

build_fixture persistent
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "2" "$rc" "persistent: cf-pi-run exits 2 (NEEDS_REPLAN)"
assert_contains "$(head -2 "$SHARD/outcome.md" | tr '\n' ' ')" "NEEDS_REPLAN" \
  "persistent: outcome Status is NEEDS_REPLAN"
assert_contains "$(cat "$SHARD/outcome.md")" "test-fail-persistent" \
  "persistent: outcome Reason is test-fail-persistent"
assert_eq "2" "$(count_of "$FLOW/dispatch.count")" "persistent: exactly 2 dispatches (one re-dispatch)"
assert_eq "3" "$(count_of "$FLOW/test.count")" "persistent: test ran 3 times (first + retest + retry)"
assert_contains "$(cat "$SHARD/implement-brief.md")" "Previous run feedback" \
  "persistent: failure feedback appended to brief for the re-dispatch"
rm -rf "$FLOW"

# ---- scenario 3: worker escalates on the fix re-brief -> survivors preserved ----
# cf.md hands "## Survived contracts" to Plan as the interfaces it must preserve,
# so an escalation discovered after step 8 must not blank the list — otherwise
# Plan re-plans a contract already committed on the shard branch.

build_fixture escalates-on-fix
PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?
assert_eq "2" "$rc" "escalates-on-fix: cf-pi-run exits 2 (NEEDS_REPLAN)"
assert_contains "$(cat "$SHARD/outcome.md")" "escalate" \
  "escalates-on-fix: outcome Reason is escalate, not test-fail-persistent"
assert_contains "$(sed -n '/^## Survived contracts/,/^## Affected/p' "$SHARD/outcome.md")" "C1" \
  "escalates-on-fix: the contract reported Completed stays in Survived contracts"
rm -rf "$FLOW"
