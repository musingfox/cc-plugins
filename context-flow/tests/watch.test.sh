#!/usr/bin/env bash
# Pins cf-pi-watch.sh's contract: emit on meaningful change only (phase
# transitions, outcomes), suppress volatile jitter (poll-round counters),
# terminal summary carries Status/Reason/Cause, exit 0 when all shards done.

. "$CF_TESTS_DIR/lib/assert.sh"

F="$(mktemp -d)"
mkdir -p "$F/shards/A" "$F/shards/B"
cat > "$F/shards.json" <<'EOF'
{"groups":{"A":{"contracts":["C1"],"files":[]},"B":{"contracts":["C2"],"files":[]}}}
EOF
echo '10:00:01 assembling brief' > "$F/shards/A/progress"
echo '10:00:02 dispatching omp'  > "$F/shards/B/progress"

(
  sleep 2
  # A: phase change (must emit) then round-counter-only change (must NOT emit)
  echo '10:00:40 poll round 3/70 RUNNING' > "$F/shards/A/progress"
  sleep 2
  echo '10:01:10 poll round 4/70 RUNNING' > "$F/shards/A/progress"
  sleep 2
  printf '## Status\nPASS\n\n## Reason\nnone\n\n## Cause\n-\n' > "$F/shards/A/outcome.md"
  printf '## Status\nNEEDS_REPLAN\n\n## Reason\ntest-fail-persistent\n\n## Cause\nFAILED test_x - AssertionError\n' > "$F/shards/B/outcome.md"
) &

out=$("$CF_TESTS_DIR/../scripts/cf-pi-watch.sh" "$F" 1)
rc=$?
wait

assert_eq "0" "$rc" "T1: watch exits 0 when all shards done"
assert_contains "$out" "assembling brief" "T2: initial snapshot emitted"
assert_contains "$out" "poll round 3/70 RUNNING" "T3: phase transition emitted"
round4=$(printf '%s\n' "$out" | grep -c 'round 4/70' || true)
assert_eq "0" "$round4" "T4: round-counter-only change suppressed"
assert_contains "$out" "--- all shards done ---" "T5: terminal marker emitted"
assert_contains "$out" "shard-A: PASS (none)" "T6: PASS summary line"
assert_contains "$out" "shard-B: NEEDS_REPLAN (test-fail-persistent) — FAILED test_x - AssertionError" \
  "T7: failure summary carries reason + cause"

rm -rf "$F"
