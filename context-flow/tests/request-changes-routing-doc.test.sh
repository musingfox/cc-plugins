#!/usr/bin/env bash
# Pins cf.md's REQUEST_CHANGES routing: repros become test cases first, then
# only the shards holding the failing contracts are re-launched.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../commands/cf.md"

handling=$(awk '/^### Handling the Verdict/ {p=1} p {print} /^### Post-PASS spec maintenance/ && p {exit}' "$CFMD")

first_line() {
  printf '%s\n' "$handling" | grep -n -m1 -F -- "$1" | cut -d: -f1
}

# T1
assert_contains "$handling" 'cf-pi-add-repros.sh' "REQUEST_CHANGES routing runs cf-pi-add-repros.sh"

# T2
add_ln=$(first_line 'cf-pi-add-repros.sh')
run_ln=$(first_line 'cf-pi-run.sh')
if [ -n "$add_ln" ] && [ -n "$run_ln" ] && [ "$add_ln" -lt "$run_ln" ]; then
  assert_eq "order" "order" "repros are appended before any shard is re-launched"
else
  assert_eq "add<run" "$add_ln,$run_ln" "repros are appended before any shard is re-launched"
fi

# T3
assert_contains "$handling" 'shards.json' "failing contracts are mapped to shards through shards.json"
assert_contains "$handling" 'run_in_background: true' "re-launched shards run as background tasks"

# T4
assert_contains "$handling" 'retries_used' "the re-launch draws on retries_used"
assert_contains "$handling" 'Do NOT rebase' "the re-launch does not rebase yet"

# T5
assert_eq "0" "$(printf '%s\n' "$handling" | grep -cF 're-run implement with the failure details as additional context' || true)" \
  "the old re-run-implement instruction is gone"

# T6
if bash "$CF_TESTS_DIR/review-two-axis.test.sh" >/dev/null; then
  assert_eq "ok" "ok" "review-two-axis.test.sh still ok"
else
  assert_eq "ok" "fail" "review-two-axis.test.sh still ok"
fi

# T7 — the re-run follows the flow's builder
assert_contains "$handling" '--prepare-only' "REQUEST_CHANGES on Claude re-prepares the shard first"
prep_ln=$(first_line '--prepare-only')
if [ -n "$add_ln" ] && [ -n "$prep_ln" ] && [ "$add_ln" -lt "$prep_ln" ]; then
  assert_eq "order" "order" "repros are appended before any shard is re-prepared"
else
  assert_eq "add<prepare" "$add_ln,$prep_ln" "repros are appended before any shard is re-prepared"
fi
step4=$(printf '%s\n' "$handling" | awk '/^  4\. / {p=1} /^  5\. / {exit} p')
assert_contains "$step4" 'review-spec.md' "step 4 hands the agent review-spec.md as failure details"
assert_eq "0" "$(printf '%s\n' "$handling" | grep -cF 'Claude fallback' || true)" "Handling names no Claude fallback"

presenting=$(awk '/^### Presenting Results/ {p=1} p {print} /^### Handling the Verdict/ && p {exit}' "$CFMD")
assert_contains "$presenting" 'builder:' "Presenting names each shard's builder from outcome.md"
assert_eq "0" "$(printf '%s\n' "$presenting" | grep -cF 'Fallback: Claude implement agent' || true)" "Presenting no longer says Fallback: Claude implement agent"
