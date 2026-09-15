#!/usr/bin/env bash
# plan.md names the defect classes that keep reaching review, and says to turn
# them into test cases rather than into a checklist.
#
# Review caught every one of these; the token-leak bypass took four rounds. What
# failed was not the review seat — it was that no finding became an assertion,
# so only someone noticing again could stop the next build. The fix belongs at
# plan time, where a class becomes a test case that runs every round.
#
# This file pins that the guidance exists, stays in plan.md (not implement.md,
# where it would be a checklist), and keeps each class traceable to where it
# came from.

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

AGENTS="$(cd "$CF_TESTS_DIR/.." && pwd)/agents"
PLAN="$AGENTS/plan.md"
IMPLEMENT="$AGENTS/implement.md"

count_f() { grep -cF "$2" "$1" 2>/dev/null || true; }

present() { # present FILE PHRASE MSG
  local n; n="$(count_f "$1" "$2")"
  if [ "${n:-0}" -ge 1 ]; then
    assert_eq "present" "present" "$3"
  else
    assert_eq "present" "absent" "$3"
  fi
}

absent() { # absent FILE PHRASE MSG
  assert_eq "0" "$(count_f "$1" "$2")" "$3"
}

# ---- the section exists, in the agent that writes contracts ----

present "$PLAN" "## Recurring Failure Classes" \
  "plan.md has the Recurring Failure Classes section"

# ---- every class that has actually recurred is named ----

for class in \
  "Secrets and credentials" \
  "Mutable release identifiers" \
  "Guard tests that cannot fail" \
  "Configuration and credential resolution"; do
  present "$PLAN" "$class" "plan.md names the class: $class"
done

# ---- each class is traceable to where it came from ----
# Without the source, the list is folklore and nobody can retire an entry.

for origin in \
  "newsletter extraction" \
  "CI release-image pipeline" \
  "docker login credential parsing"; do
  present "$PLAN" "$origin" "plan.md cites the origin: $origin"
done

# ---- the instruction is to assert, not to remember ----

present "$PLAN" "write the test case that makes it fail" \
  "plan.md says to turn a class into a failing test case"
present "$PLAN" "Assert the bypass path, not the happy path" \
  "plan.md says to assert the bypass, which is what four review rounds missed"
present "$PLAN" "Assert it red first" \
  "plan.md says a guard test must be seen to fail"
present "$PLAN" "checklist is re-read or it is not" \
  "plan.md says why a checklist is the weaker form"

# ---- it must NOT become a builder checklist ----
# The rejected fix was a de-duplicated list of past review findings for the
# builder to read before requesting review. Prose the builder re-reads each
# round is exactly the form this replaces.

absent "$IMPLEMENT" "Recurring Failure Classes" \
  "implement.md does not carry the class list (it would be a checklist there)"
absent "$IMPLEMENT" "review findings checklist" \
  "implement.md has no review-findings checklist"
