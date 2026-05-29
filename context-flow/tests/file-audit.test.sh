#!/usr/bin/env bash
# Documentation-level regression pin for FileAuditGranularityRegression (#1 keep-as-is).
# Pins the intended `comm -23 <(actual) <(declared)` undeclared-file semantics
# over synthetic declared/actual lists (per-shard-union granularity).
# This test asserts the contract behavior directly; it does NOT extract or
# depend on the live inline implementation in cf-pi-run.sh (lines 430-435).

. "$CF_TESTS_DIR/lib/assert.sh"

# T1: actual subset of declared -> empty undeclared set
declared_list=$(mktemp)
actual_list=$(mktemp)
printf 'x.ts\n' > "$declared_list"
printf 'x.ts\n' > "$actual_list"
undeclared=$(comm -23 <(sort "$actual_list") <(sort "$declared_list"))
assert_eq "" "$undeclared" "T1: actual subset of declared yields empty undeclared"

# T2: file in actual but not declared -> reported as undeclared
printf 'x.ts\ny.ts\n' > "$actual_list"
undeclared=$(comm -23 <(sort "$actual_list") <(sort "$declared_list"))
assert_eq "y.ts" "$undeclared" "T2: undeclared file in actual is reported"

# T3: file in both -> not reported as undeclared
printf 'x.ts\n' > "$actual_list"
undeclared=$(comm -23 <(sort "$actual_list") <(sort "$declared_list"))
assert_eq "" "$undeclared" "T3: common file is not reported undeclared"

rm -f "$declared_list" "$actual_list"
