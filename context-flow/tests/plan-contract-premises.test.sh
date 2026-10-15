#!/usr/bin/env bash
# A contract's tests must pass with only its own files and its depends in place,
# and a test that leans on existing code cites what was read. Both 2026-10-15
# flows lost a round to a plan that broke one of these.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

plan=$(cat "$CF_TESTS_DIR/../agents/plan.md")

assert_contains "$plan" "can pass with only its own \`touches_files\` and those of the contracts in its \`depends\`" "plan: contract tests are self-sufficient"
assert_contains "$plan" "backed by a file:line you read this session, or is listed in Assumptions" "plan: test premises cite code or Assumptions"
