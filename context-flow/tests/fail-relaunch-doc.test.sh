#!/usr/bin/env bash
# Pins cf.md's re-launch of a failed or partially replanned shard on the flow's
# current builder.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"

any_fail=$(awk '/^#### Any FAIL/ {p=1; next} p && /^####/ {exit} p' "$CFMD")
replan=$(awk '/^#### Any NEEDS_REPLAN/ {p=1; next} p && /^(####|###) / {exit} p' "$CFMD")

# T1
assert_contains "$any_fail" '--prepare-only' "Any FAIL re-launches on Claude through --prepare-only"
assert_contains "$any_fail" '§3.2' "Any FAIL points at the §3.2 round"

# T2
assert_eq "0" "$(printf '%s\n' "$any_fail" | grep -cF 'a FAIL means OMP infrastructure failure' || true)" \
  "Any FAIL no longer calls every FAIL an OMP failure"

# T3
assert_contains "$replan" '§3.2' "the partial-replan re-fan-out names §3.2"
assert_contains "$replan" '§3.6' "the partial-replan re-fan-out names §3.6"

# T4
assert_contains "$any_fail" 'Per-shard, per-round FAIL retry budget = 1' "the FAIL retry budget stays one"

# OmpRelaunchOneTask T1
assert_contains "$any_fail" 'one background Bash' "Any FAIL re-launches OMP shards on one background Bash"
assert_contains "$any_fail" '§3.6' "Any FAIL points at the §3.6 single-task form"
for stale in 'LATER message' 'Re-arm' 'cf-pi-watch' 'progress monitor'; do
  assert_eq "0" "$(printf '%s\n' "$any_fail" | grep -cF -- "$stale" || true)" "Any FAIL no longer names $stale"
done

# OmpRelaunchOneTask T3 (3.4 side)
assert_eq "0" "$(printf '%s\n' "$any_fail" | grep -cE '^ *Bash\(run_in_background' || true)" \
  "Any FAIL holds no per-shard Bash(run_in_background example"
