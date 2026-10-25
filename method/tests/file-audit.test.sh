#!/usr/bin/env bash
# Documentation-level regression pin for FileAuditGranularityRegression (#1 keep-as-is).
# Pins the intended `comm -23 <(actual) <(declared)` undeclared-file semantics
# over synthetic declared/actual lists (union of the contracts' touches_files).
# This test asserts the contract behavior directly; it does NOT extract or
# depend on the live implementation in scope-gate.sh (scope-gate.test.sh drives that).

. "$METHOD_TESTS_DIR/lib/assert.sh"

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

# T4-T6: build/lock allowlist splits benign manifest touches from real violations.
# Pins the CF_BUILD_LOCK_ALLOWLIST regex semantics of scope-gate.sh and revert-gate.sh.
AL='^(pyproject\.toml|uv\.lock|requirements[^/]*\.txt|package\.json|package-lock\.json|bun\.lock(b)?|yarn\.lock|pnpm-lock\.yaml|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?)$'
undeclared=$'pyproject.toml\nuv.lock\nsrc/evil.py'
allowlisted=$(printf '%s\n' "$undeclared" | grep -E "$AL" || true)
remaining=$(printf '%s\n' "$undeclared" | grep -vE "$AL" || true)
assert_eq $'pyproject.toml\nuv.lock' "$allowlisted" "T4: root build/lock files are allowlisted"
assert_eq "src/evil.py" "$remaining" "T5: non-manifest file still flagged undeclared"
assert_eq "" "$(printf 'docs/uv.lock.md\n' | grep -E "$AL" || true)" "T6: nested/lookalike paths are NOT allowlisted"

# T7: the pinned regex is the one the gate carries.
live="$(sed -n 's/^CF_BUILD_LOCK_ALLOWLIST=//p' "$METHOD_TESTS_DIR/../scripts/scope-gate.sh")"
assert_eq "'$AL'" "$live" "T7: scope-gate.sh carries the pinned build/lock allowlist"

rm -f "$declared_list" "$actual_list"
