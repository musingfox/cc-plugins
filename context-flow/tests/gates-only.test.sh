#!/usr/bin/env bash
# cf-pi-run.sh --gates-only runs lifecycle steps 6-13 on a Claude builder's
# commits and report, ending in the same outcome.md as the OMP path, without
# preparing, probing, dispatching or polling. NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"

status_of() { sed -n '/^## Status/{n;p;}' "$SHARD/outcome.md"; }
reason_of() { sed -n '/^## Reason/{n;p;}' "$SHARD/outcome.md"; }

# T1: stub fixture, valid report, stale outcome -> PASS, nothing dispatched
fx_build
fx_report valid
fx_stale_outcome
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "0" "$RC" "T1 exit"
assert_eq "PASS" "$(status_of)" "T1 Status"
assert_eq present "$(fx_exists "$SHARD/implement-report.md")" "T1 report kept"
for f in probe dispatch worktree brief; do
  assert_eq absent "$(fx_exists "$FLOW/$f.count")" "T1 $f never ran"
done
fx_clean

# T2: escalate.md -> NEEDS_REPLAN escalate, blocker kept
fx_build
fx_report valid
fx_escalate
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "2" "$RC" "T2 exit"
assert_eq "escalate" "$(reason_of)" "T2 Reason"
assert_eq present "$(fx_exists "$SHARD/escalate.md")" "T2 escalate.md kept"
fx_clean

# T3: wired, real git, no stubs
TMP="$(mktemp -d)"
REPO="$TMP/repo"
FLOW="$TMP/flow"
mkdir -p "$REPO" "$FLOW"
git -C "$REPO" init -q -b main && git -C "$REPO" config core.hooksPath /dev/null
git -C "$REPO" config user.email t@t && git -C "$REPO" config user.name t
echo base > "$REPO/base.txt"
git -C "$REPO" add -A && git -C "$REPO" commit -qm base
cat > "$FLOW/contracts.json" <<'JSON'
{"schema_version": 1, "flow_id": "t",
 "contracts": [{"name": "C1", "touches_files": ["src/x.txt", "tests/x.test.sh"]}]}
JSON
cat > "$FLOW/env.sh" <<ENV
SESSION="$FLOW"
SESSION_BASENAME="$(basename "$FLOW")"
PLUGIN_ROOT="$CF_TESTS_DIR/.."
SCRIPTS="$REAL_SCRIPTS"
PI_PROTOCOL="$CF_TESTS_DIR/../docs/pi-implementer-protocol.md"
CLEANUP_SCRIPT="$FLOW/cleanup.sh"
PI_DESC="test"
PI_STALL_THRESHOLD_S="180"
PI_WALL_CLOCK_S="1800"
PI_AVAILABLE="1"
ENV
touch "$FLOW/cleanup.sh"
"$REAL_SCRIPTS/cf-pi-shard.sh" "$FLOW" >/dev/null
SHARD="$FLOW/shards/A"
HEAD_BEFORE="$(git -C "$REPO" rev-parse HEAD)"

( cd "$REPO" && bash "$REAL_SCRIPTS/cf-pi-run.sh" --prepare-only "$SHARD" goal none 'bash tests/x.test.sh' ) \
  > "$TMP/prepare.log" 2>&1
assert_eq "0" "$?" "T3 prepare-only exit"

W="$SHARD/work"
mkdir -p "$W/src" "$W/tests"
echo hello > "$W/src/x.txt"
echo 'grep -q hello src/x.txt' > "$W/tests/x.test.sh"
git -C "$W" add -A && git -C "$W" commit -qm "add x"
printf '## Summary\nDone.\n\n## Completed\n- Wrote x _(contract: C1)_\n' > "$SHARD/implement-report.md"

( cd "$REPO" && bash "$REAL_SCRIPTS/cf-pi-run.sh" --gates-only "$SHARD" goal none 'bash tests/x.test.sh' ) \
  > "$TMP/gates.log" 2>&1
rc=$?
assert_eq "0" "$rc" "T3 gates-only exit"
assert_eq "PASS" "$(sed -n '/^## Status/{n;p;}' "$SHARD/outcome.md")" "T3 Status"
assert_eq "CLEAN 1" "$(head -1 "$SHARD/revert-gate.out")" "T3 revert gate verdict"
assert_eq "$HEAD_BEFORE" "$(git -C "$REPO" rev-parse HEAD)" "T3 host repo HEAD unchanged"
git -C "$REPO" worktree remove --force "$W" >/dev/null 2>&1
rm -rf "$TMP"

# T4: unknown leading flag
fx_build
fx_run --bogus "$SHARD" goal none true
assert_eq "1" "$RC" "T4 exit"
assert_contains "$(cat "$FLOW/run.err")" "Usage:" "T4 usage on stderr"
fx_clean
