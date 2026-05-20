#!/usr/bin/env bash
# Assemble Pi implementation brief from plan.md + protocol fenced sections.
# All content flows file->file via sed/cat; nothing passes through the orchestrator's context.
#
# Usage:   cf-pi-brief.sh SESSION GOAL_ONELINE CONSTRAINTS TEST_RUNNER
# Stdout:  $BRIEF_FILE path on success
# Exit:    non-zero with BRIEF MALFORMED on stderr if any input chunk is empty
#          or the assembled brief has fewer than 6 '## ' headers
# Reads:   $SESSION/plan.md (must contain '## Behavioral Contracts' and '## Implementation Plan')
#          $PI_PROTOCOL (must contain METHODOLOGY-BEGIN/END and SCHEMA-BEGIN/END markers)
# Writes:  $SESSION/{brief-contracts.md, brief-impl-plan.md, brief-methodology.md,
#                    brief-report-schema.md, implement-brief.md ($BRIEF_FILE)}

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

session="$1"; goal="$2"; constraints="$3"; test_runner="$4"
load_cf_pi_env "$session"

# Extract Behavioral Contracts + Implementation Plan from plan.md
sed -n '/^## Behavioral Contracts/,/^## Implementation Plan/{/^## Implementation Plan/!p;}' \
  "$session/plan.md" > "$session/brief-contracts.md"
sed -n '/^## Implementation Plan/,/^## Completed/{/^## Completed/!p;}' \
  "$session/plan.md" > "$session/brief-impl-plan.md"

# Extract methodology + report schema from protocol via fenced markers
sed -n '/<!-- METHODOLOGY-BEGIN -->/,/<!-- METHODOLOGY-END -->/{//!p;}' \
  "$PI_PROTOCOL" > "$session/brief-methodology.md"
sed -n '/<!-- SCHEMA-BEGIN -->/,/<!-- SCHEMA-END -->/{//!p;}' \
  "$PI_PROTOCOL" > "$session/brief-report-schema.md"

# Sanity: each chunk must be non-empty
for f in brief-contracts.md brief-impl-plan.md brief-methodology.md brief-report-schema.md; do
  if [ ! -s "$session/$f" ]; then
    echo "BRIEF MALFORMED: $session/$f is empty" >&2
    exit 1
  fi
done

{
  echo "# Implementation Brief"; echo
  echo "## Methodology"; echo
  cat "$session/brief-methodology.md"; echo
  echo "## Context Summary"
  echo "- **Goal**: $goal"
  echo "- **Key constraints**: $constraints"
  echo "- **Working directory**: $WORK"
  echo "- **Test runner**: \`$test_runner\`"
  echo
  cat "$session/brief-contracts.md"; echo
  cat "$session/brief-impl-plan.md"; echo
  echo "## Output Requirements"; echo
  echo "You MUST write a report to \`$REPORT_FILE\` using EXACTLY this schema:"; echo
  cat "$session/brief-report-schema.md"; echo
  echo "After writing the report and only after all tests pass, your stdout must print exactly: \`DONE\`"
} > "$BRIEF_FILE"

# Final sanity: minimum header count
headers=$(grep -c '^## ' "$BRIEF_FILE")
if [ "$headers" -lt 6 ]; then
  echo "BRIEF MALFORMED: only $headers '## ' headers (expected >=6)" >&2
  exit 1
fi

echo "$BRIEF_FILE"
