#!/usr/bin/env bash
# cf-pi-run.sh --prepare-only readies a shard for the Claude builder (worktree,
# merged prerequisites, fresh brief, last round's artifacts cleared) and never
# probes or dispatches OMP. NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"

# T1: prepared, stale artifacts cleared, no probe/dispatch
fx_build
fx_stale_outcome
fx_report valid
fx_escalate
echo report > "$SHARD/rebriefs"
fx_run --prepare-only "$SHARD" goal none true
assert_eq "0" "$RC" "T1 exit"
assert_eq "PREPARED $SHARD/implement-brief.md" "$(fx_last)" "T1 last stdout line"
for f in outcome.md implement-report.md escalate.md rebriefs; do
  assert_eq absent "$(fx_exists "$SHARD/$f")" "T1 $f cleared"
done
assert_eq absent "$(fx_exists "$FLOW/probe.count")" "T1 probe never ran"
assert_eq absent "$(fx_exists "$FLOW/dispatch.count")" "T1 dispatch never ran"
fx_clean

# T2: unmet prerequisite is a prepare FAIL, not a dispatch
fx_build
cat > "$FLOW/shards.json" <<'JSON'
{"groups": {"A": {"contracts": ["C1"], "files": ["src/x.ts"], "depends_on": ["B"]}, "B": {"contracts": ["C2"], "files": []}}}
JSON
fx_run --prepare-only "$SHARD" goal none true
assert_eq "1" "$RC" "T2 exit"
assert_eq "FAIL" "$(sed -n '/^## Status/{n;p;}' "$SHARD/outcome.md")" "T2 Status"
assert_eq "prereq-missing" "$(sed -n '/^## Reason/{n;p;}' "$SHARD/outcome.md")" "T2 Reason"
assert_eq absent "$(fx_exists "$FLOW/dispatch.count")" "T2 dispatch never ran"
fx_clean

# T3: worktree dies silently -> outcome-missing
FX_WORKTREE_FAILS=1 fx_build
fx_run --prepare-only "$SHARD" goal none true
assert_eq "1" "$RC" "T3 exit"
assert_contains "$(cat "$SHARD/outcome.md" 2>/dev/null)" "outcome-missing" "T3 outcome-missing recorded"
fx_clean

# T4: wrong positional count
fx_build
fx_run --prepare-only "$SHARD" goal none
assert_eq "1" "$RC" "T4 exit"
assert_contains "$(cat "$FLOW/run.err")" "Usage:" "T4 usage on stderr"
assert_eq absent "$(fx_exists "$SHARD/outcome.md")" "T4 no outcome.md"
fx_clean
