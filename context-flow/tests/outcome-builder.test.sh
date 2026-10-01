#!/usr/bin/env bash
# Every outcome.md names the builder in `## Run`: claude for --gates-only and
# --prepare-only, omp for the plain four-argument form. NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"
. "$CF_TESTS_DIR/lib/run-fixture.sh"

run_section() { sed -n '/^## Run/,/^$/p' "$SHARD/outcome.md"; }
builder_lines() { run_section | grep -c '^- builder: '; }

# T1: gates-only PASS
fx_build
fx_report valid
fx_run --gates-only "$SHARD" goal none "$RUNNER"
assert_eq "0" "$RC" "T1 exit"
assert_contains "$(run_section)" "- builder: claude" "T1 builder claude"
assert_eq "1" "$(builder_lines)" "T1 exactly one builder line"
assert_contains "$(run_section)" "- elapsed: " "T4 elapsed kept (gates-only)"
fx_clean

# T2: plain form PASS
FX_DISPATCH_REPORT=1 fx_build
fx_run "$SHARD" goal none "$RUNNER"
assert_eq "0" "$RC" "T2 exit"
assert_contains "$(run_section)" "- builder: omp" "T2 builder omp"
assert_eq "1" "$(builder_lines)" "T2 exactly one builder line"
assert_contains "$(run_section)" "- elapsed: " "T4 elapsed kept (plain)"
fx_clean

# T3: prepare-only ending FAIL prereq-missing
fx_build
cat > "$FLOW/shards.json" <<'JSON'
{"groups": {"A": {"contracts": ["C1"], "files": ["src/x.ts"], "depends_on": ["B"]}, "B": {"contracts": ["C2"], "files": []}}}
JSON
fx_run --prepare-only "$SHARD" goal none true
assert_eq "prereq-missing" "$(sed -n '/^## Reason/{n;p;}' "$SHARD/outcome.md")" "T3 reason"
assert_contains "$(run_section)" "- builder: claude" "T3 builder claude"
assert_contains "$(run_section)" "- elapsed: " "T4 elapsed kept (prepare-only)"
fx_clean
