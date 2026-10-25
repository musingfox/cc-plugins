#!/usr/bin/env bash
# Pins the text contract of agents/review.md for the shape where the main session
# pins a contract with the human, a builder implements it, and cf:review judges
# the builder's diff on the Spec axis alone.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

file="$CF_TESTS_DIR/../agents/review.md"
doc=$(cat "$file")

# Banned words, whole words, case-insensitive. Inflections of the same stems are
# banned too; "implemented but wrong" is a FAIL class and stays.
BANNED='implement|omp|orchestrators?|research(ed)?|shards?|sharding|haiku'
hits=$(grep -Eiwn "$BANNED" "$file" || true)
assert_eq "" "$hits" "review: no implement/OMP/orchestrator/research/shard/haiku word"

# Section of the doc between a heading line and the next heading of the same level.
section() { awk -v h="$1" '$0 == h {on=1; next} on && /^#/ {exit} on' "$file"; }
# First fenced block that follows a heading line.
fenced_after() { awk -v h="$1" '$0 == h {on=1; next} on && /^```/ {n++; if (n==2) exit; next} on && n==1' "$file"; }

# Spec axis only
assert_eq "" "$(grep -n 'Standards' "$file" || true)" "review: no Standards axis"
assert_eq "" "$(grep -n '## Axis' "$file" || true)" "review: no ## Axis dispatch line"
assert_eq "" "$(grep -n 'Implement Concerns' "$file" || true)" "review: no Implement Concerns"

# Verdict values and position
for v in 'APPROVE' 'APPROVE-with-advisories' 'REQUEST_CHANGES'; do
  assert_contains "$doc" "$v" "review: verdict value $v"
done
assert_contains "$doc" "on the line immediately after the \`## Verdict\` heading" "review: verdict value sits on the line after ## Verdict"
schema_verdict=$(fenced_after '### Output Schema (Spec)' | awk '/^## Verdict$/ {getline; print}')
assert_eq "APPROVE | APPROVE-with-advisories | REQUEST_CHANGES" "$schema_verdict" "review: schema line after ## Verdict lists the three values"

# Layer line on every FAIL and Blocker
layer_entry='- **Layer**: code | contract | milestone'
assert_eq "2" "$(fenced_after '### Output Schema (Spec)' | grep -cF -- "$layer_entry" | tr -d ' ')" "review: schema carries Layer in Contract Verification and Blockers only"
cv=$(fenced_after '### Output Schema (Spec)' | awk '/^## Contract Verification/ {on=1; next} /^## Advisories/ {on=0} on')
bl=$(fenced_after '### Output Schema (Spec)' | awk '/^## Blockers/ {on=1; next} /^## Completed/ {on=0} on')
assert_contains "$cv" "$layer_entry" "review: Contract Verification entry carries Layer"
assert_contains "$bl" "$layer_entry" "review: Blocker entry carries Layer"
assert_contains "$doc" "Status FAIL" "review: Layer rule names Status FAIL entries"
assert_contains "$doc" "**code** means the implementation is wrong against a sound contract" "review: code layer defined"
assert_contains "$doc" "**contract** means the contract itself is wrong or incomplete" "review: contract layer defined"
assert_contains "$doc" "**milestone** means the goal or a premise above the contracts is false" "review: milestone layer defined"

# Layer line after REQUEST_CHANGES, highest layer
assert_contains "$doc" "the line after the verdict value is exactly \`Layer: <code|contract|milestone>\`" "review: REQUEST_CHANGES is followed by the Layer line"
assert_contains "$doc" "highest layer among the FAILs and Blockers (code < contract < milestone)" "review: Layer is the highest layer, ordered"
assert_contains "$doc" "APPROVE and APPROVE-with-advisories carry no Layer line" "review: approvals have no Layer line"
ret=$(fenced_after '### Return Format')
assert_contains "$ret" "Layer: <code|contract|milestone>" "review: return format shows the Layer line"
assert_contains "$ret" "APPROVE | APPROVE-with-advisories | REQUEST_CHANGES" "review: return format shows the verdict values"
assert_eq "REQUEST_CHANGES" "$(printf '%s\n' "$ret" | awk '/^## Verdict$/ {getline; sub(/^.*\| */, ""); print}')" "review: return format puts REQUEST_CHANGES last on the verdict line"

# Advisories carry a reproducing command
adv=$(fenced_after '### Output Schema (Spec)' | awk '/^## Advisories/ {on=1; next} /^## Blockers/ {on=0} on')
assert_contains "$adv" "- **Repro**: <self-contained command, run from the reviewed tree's root>" "review: advisory entry has a Repro line"
assert_contains "$adv" "- **Repro**: none" "review: advisory Repro may be none"
assert_contains "$doc" "the main session turns each advisory into a test case or drops it, and never applies a reviewer's suggested fix by hand" "review: advisory handling rule"

# Dispatch inputs
for k in '## Contracts file' '## Diff path' 'Report path:' 'Repros path:'; do
  assert_contains "$doc" "$k" "review: dispatch input $k"
done
assert_contains "$doc" "## Diff command" "review: dispatch may carry a diff command"

# Kept clauses
assert_contains "$doc" "**missing or partial**" "review: FAIL class missing or partial"
assert_contains "$doc" "**scope creep**" "review: FAIL class scope creep"
assert_contains "$doc" "**implemented but wrong**" "review: FAIL class implemented but wrong"
assert_contains "$doc" "**quote the contract**" "review: FAIL quotes the contract line"
assert_contains "$doc" "Fuzzy criteria are binding too" "review: fuzzy criteria binding"
assert_contains "$doc" "mktemp -d" "review: edge probing in mktemp -d"
assert_contains "$doc" "### Repros File" "review: repros file kept"
assert_contains "$doc" "release note" "review: What Changed release-note rules kept"
assert_contains "$doc" "Downstream-effect rule" "review: downstream-effect rule kept"

# Front matter
tools=$(grep -m1 '^tools:' "$file")
assert_eq "tools: Read, Write, Grep, Glob, Bash" "$tools" "review: read-only tool list"
assert_eq "" "$(printf '%s\n' "$tools" | grep -w Edit || true)" "review: tools line has no Edit"
assert_eq "model: opus" "$(grep -m1 '^model:' "$file")" "review: model opus"

# The person is the human
assert_contains "$doc" "the human" "review: says the human"
assert_eq "" "$(grep -Eiwn 'the users?' "$file" || true)" "review: never says the user"

# Observed output channels: the reviewer checks the channels a contract observes in
# both directions, by running the test cases and probing
cc=$(section '#### 1. Contract Compliance (binding)')
obs=$(printf '%s\n' "$cc" | grep -F -- '- **Observed channels**')
assert_eq "1" "$(printf '%s\n' "$cc" | grep -cF -- '- **Observed channels**' | tr -d ' ')" "review: Contract Compliance has one Observed channels clause"
assert_contains "$obs" '`observes`' "review: clause reads the contract's observes"
for ch in stdout stderr exit files; do
  assert_contains "$obs" "\`$ch\`" "review: clause names channel $ch"
done

# Observed, written to, not asserted by any test case: missing or partial, contract layer
assert_contains "$obs" "that no test case asserts, is a FAIL of class **missing or partial** with \`- **Layer**: contract\`" "review: unasserted observed channel is missing or partial at the contract layer"
assert_contains "$obs" "A channel the contract observes that the implementation writes to" "review: the unasserted-channel clause is about a channel the implementation writes to"

# Written to a channel the contract does not observe: implemented but wrong, code layer
assert_contains "$obs" "a channel the contract does not observe (for example an unexpected stderr line) is a FAIL of class **implemented but wrong** with \`- **Layer**: code\`" "review: output on an unobserved channel is implemented but wrong at the code layer"

# Both checks run, they are not read off the contract
assert_contains "$obs" "running the test cases and probing, as for any other clause" "review: both checks are made by running the test cases and probing"
