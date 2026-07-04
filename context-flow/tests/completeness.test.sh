#!/usr/bin/env bash
# Completeness gate of cf-pi-run.sh: PASS requires survivors == declared.
#
# A shard that declares C1+C2 but whose report claims only C1 completed must
# NOT read as PASS — the unimplemented C2 has no failing test yet, so gate 3
# cannot catch it. Expected: NEEDS_REPLAN / incomplete-contracts, C1 in
# Survived, C2 in Affected (so main routes it to replan this round).
#
# Same stub harness as gate3-retest.test.sh: real cf-pi-run.sh, sibling
# scripts + sleep/git stubbed.

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

FLOW="$(mktemp -d)"
SHARD="$FLOW/shards/A"
STUBS="$FLOW/stubs"
mkdir -p "$SHARD" "$STUBS"

cat > "$FLOW/shards.json" <<'JSON'
{"groups": {"A": {"contracts": ["C1", "C2"], "files": ["src/x.ts", "src/y.ts"]}}}
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

# Report claims only C1 of the two declared contracts.
cat > "$SHARD/implement-report.md" <<'EOF'
## Summary
Did half the work.

## Completed
- Implemented the thing _(contract: C1)_
EOF

for s in cf-pi-worktree.sh cf-pi-brief.sh cf-pi-stop.sh; do
  printf '#!/bin/bash\nexit 0\n' > "$STUBS/$s"
done
printf '#!/bin/bash\necho OK\n' > "$STUBS/cf-pi-probe.sh"
printf '#!/bin/bash\necho "pm"\n' > "$STUBS/cf-pi-postmortem.sh"
printf '#!/bin/bash\necho 12345\n' > "$STUBS/cf-pi-dispatch.sh"
printf '#!/bin/bash\necho "STATUS=OK"\n' > "$STUBS/cf-pi-poll.sh"
printf '#!/bin/bash\necho "test_exit=0"\nexit 0\n' > "$STUBS/cf-pi-test.sh"
printf '#!/bin/bash\nexit 0\n' > "$STUBS/sleep"
printf '#!/bin/bash\nexit 0\n' > "$STUBS/git"
chmod +x "$STUBS"/*

PATH="$STUBS:$PATH" bash "$REAL_SCRIPTS/cf-pi-run.sh" "$SHARD" "goal" "none" "true" \
  > "$FLOW/run.log" 2>&1
rc=$?

assert_eq "2" "$rc" "incomplete shard exits 2 (NEEDS_REPLAN)"
assert_contains "$(head -2 "$SHARD/outcome.md" | tr '\n' ' ')" "NEEDS_REPLAN" \
  "outcome Status is NEEDS_REPLAN"
assert_contains "$(cat "$SHARD/outcome.md")" "incomplete-contracts" \
  "outcome Reason is incomplete-contracts"
SURV="$(sed -n '/^## Survived contracts/,/^$/p' "$SHARD/outcome.md")"
AFF="$(sed -n '/^## Affected contracts/,/^$/p' "$SHARD/outcome.md")"
assert_contains "$SURV" "C1" "completed contract C1 listed as survived"
assert_contains "$AFF" "C2" "missing contract C2 listed as affected (routes to replan)"
case "$AFF" in *C1*) assert_eq "no-C1" "C1-in-affected" "C1 must not be in affected" ;; *) assert_eq ok ok "C1 not in affected" ;; esac

rm -rf "$FLOW"
