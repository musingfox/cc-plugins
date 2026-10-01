#!/usr/bin/env bash
# After a mid-flow builder switch, a Claude shard's outcome.md must not point at
# or quote a previous OMP round's worker JSONL. NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"

seed_old_omp() {
  mkdir -p "$SHARD/pi-sessions"
  printf '{"errorMessage":"OLD OMP ROUND quota exhausted"}\n' > "$SHARD/pi-sessions/old.jsonl"
  printf 'PI_SESSION_DIR="%s/pi-sessions"\n' "$SHARD" >> "$SHARD/env.sh"
}

# T1: gates-only PASS names no session_jsonl
fx_build
seed_old_omp
fx_report valid
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "0" "$RC" "T1 exit"
assert_eq "0" "$(grep -c 'old.jsonl' "$SHARD/outcome.md" || true)" "T1 outcome does not point at the old OMP session"
fx_clean

# T2: gates-only FAIL quotes no old OMP errorMessage
fx_build
seed_old_omp
fx_report valid
fx_test_mode nomarker
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "0" "$(grep -c 'OLD OMP ROUND' "$SHARD/outcome.md" || true)" "T2 outcome does not quote the old OMP error"
assert_eq "0" "$(grep -c 'old.jsonl' "$SHARD/outcome.md" || true)" "T2 outcome does not point at the old OMP session"
fx_clean

# T3: the plain OMP form still finds its own session JSONL
FX_DISPATCH_REPORT=1 fx_build
seed_old_omp
fx_run "$SHARD" goal none "$RUNNER"
assert_contains "$(cat "$SHARD/outcome.md")" "old.jsonl" "T3 OMP outcome keeps session_jsonl"
fx_clean
