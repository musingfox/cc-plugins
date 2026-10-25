#!/usr/bin/env bash
# Pins the text contract of agents/plan.md for the shape where the main session
# pins a contract with the human and cf:plan drafts contracts and test cases from
# it and the repository alone.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

file="$CF_TESTS_DIR/../agents/plan.md"
doc=$(cat "$file")

# Banned words, whole words, case-insensitive. "Implementation Plan" is a section
# name and stays: it is not the word "implement".
BANNED='implement|omp|orchestrators?|research(ed)?|shards?|sharding'
hits=$(grep -Eiwn "$BANNED" "$file" || true)
assert_eq "" "$hits" "plan: no implement/OMP/orchestrator/research/shard word"
assert_eq "" "$(grep -n 'cf-pi-' "$file" || true)" "plan: no cf-pi-*.sh script named"

# Removed inputs and modes
assert_eq "" "$(grep -in 'research\.md' "$file" || true)" "plan: research.md is not an input"
assert_eq "" "$(grep -n 'Research Insufficiency' "$file" || true)" "plan: no Research Insufficiency"
assert_eq "" "$(grep -n 'REPLAN_REQUIRES_ROLLBACK' "$file" || true)" "plan: no REPLAN_REQUIRES_ROLLBACK"
assert_eq "" "$(grep -in 'contracts-revision' "$file" || true)" "plan: no contracts-revision"
assert_eq "" "$(grep -in 'partial.replan' "$file" || true)" "plan: no partial replan"
assert_eq "" "$(grep -n 'parallel_group' "$file" || true)" "plan: no parallel_group"

# Input is the pinned contract plus the repository
assert_contains "$doc" "contract the main session pinned with the human" "plan: input is the pinned contract"
assert_contains "$doc" "the repository" "plan: input includes the repository"

# touches_files / test_files
assert_contains "$doc" "SUPERSET of every file the contract creates or modifies" "plan: touches_files stays a superset"
assert_contains "$doc" "cf-scope.sh" "plan: touches_files consumer cf-scope.sh"
assert_contains "$doc" "cf-revert-gate.sh" "plan: touches_files consumer cf-revert-gate.sh"
assert_contains "$doc" "the entries of \`touches_files\` that are this contract's tests" "plan: test_files unchanged"

# Load-bearing assumptions
assert_contains "$doc" "## Load-bearing assumptions" "plan: Load-bearing assumptions section"
section=$(awk '/^## Load-bearing assumptions$/ {on=1; next} on && /^```/ {exit} on' "$file")
assert_contains "$section" "two or more contracts" "plan: section is scoped to assumptions that change two or more contracts"
assert_contains "$section" "receipt" "plan: entries carry a receipt"
assert_contains "$section" "file:line" "plan: receipt may be a file:line"
assert_contains "$section" "observed output" "plan: receipt may be a command and its observed output"
assert_contains "$section" "prototype result" "plan: receipt may be a prototype result"
assert_contains "$section" "unproven" "plan: entry may be unproven"
assert_contains "$doc" "does not dispatch a builder while any entry is \`unproven\`" "plan: main session holds the builder on unproven"
assert_contains "$doc" "still write" "plan: plan still writes its output when unproven"

# Existing premise clauses stay
assert_contains "$doc" "## Assumptions" "plan: Assumptions section stays"

# No contents list: the file is the agent's prompt, paid per dispatch
assert_eq "" "$(grep -Ein '^#+ +(table of )?contents' "$file" || true)" "plan: no contents heading"
assert_eq "" "$(grep -Ein 'table of contents' "$file" || true)" "plan: no table of contents"

# Front matter
assert_eq "model: sonnet" "$(grep -m1 '^model:' "$file")" "plan: model unchanged"

# The person is the human
assert_contains "$doc" "the human" "plan: says the human"
assert_eq "" "$(grep -Eiwn 'the users?' "$file" || true)" "plan: never says the user"

# Observed output channels: a contract names the channels its tests observe, so a
# channel cannot be dropped between the plan and the brief
schema=$(awk '/^### plan.md \(prose\)$/ {on=1; next} on && /^### contracts.json/ {exit} on' "$file")
contract_block=$(printf '%s\n' "$schema" | awk '/^## Behavioral Contracts$/ {on=1; next} on && /^## Implementation Plan$/ {exit} on')
sidecar=$(awk '/^### contracts.json/ {on=1; next} on && /^#### Worked example/ {exit} on' "$file")
example=$(printf '%s\n' "$sidecar" | awk '/^```json$/ {on=1; next} on && /^```$/ {exit} on')
checklist=$(awk '/^## Before Returning$/ {on=1; next} on' "$file")

# contracts.json: example and field list
assert_contains "$example" '"observes": ["stdout", "stderr", "exit", "files"]' "plan: contracts.json example shows observes with the four channels"
assert_eq "1" "$(printf '%s\n' "$sidecar" | grep -c '^- \*\*`observes`\*\*')" "plan: field list has an observes rule"
obs_rule=$(printf '%s\n' "$sidecar" | grep '^- \*\*`observes`\*\*')
assert_contains "$obs_rule" "required" "plan: observes is required"
assert_contains "$obs_rule" "non-empty array" "plan: observes is a non-empty array"
for ch in stdout stderr exit files; do
  assert_contains "$obs_rule" "\`$ch\`" "plan: observes rule names channel $ch"
done

# Markdown contract: an Observes line, matching observes
assert_contains "$contract_block" '- **Observes**: <comma-separated channels' "plan: markdown contract carries an Observes line"
assert_contains "$obs_rule" "Observes" "plan: observes rule ties the markdown Observes line to the field"
assert_contains "$obs_rule" "matching" "plan: Observes line matches observes"

# Test cases state an expected value for each observed channel; empty is a value
tc_line=$(printf '%s\n' "$contract_block" | grep -A3 '^#### Test Cases$')
assert_contains "$tc_line" "each channel" "plan: test case states an expected value for each observed channel"
assert_contains "$tc_line" "stderr: empty" "plan: empty is a valid expected value, e.g. stderr: empty"
assert_contains "$(printf '%s\n' "$sidecar" | grep '^- \*\*`test_cases`\*\*:')" "each channel" "plan: structured test_cases carry every observed channel"

# Plan checklist requires it
assert_contains "$checklist" '`observes`' "plan: Before Returning requires observes"
assert_contains "$checklist" "Observes" "plan: Before Returning requires the Observes line"
assert_contains "$checklist" "empty" "plan: Before Returning accepts empty as an expected value"
