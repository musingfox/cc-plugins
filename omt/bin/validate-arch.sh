#!/bin/sh
# validate-arch.sh — Validate arch.md structure for OMT workflow
# Usage: validate-arch.sh <path-to-arch.md>
# Exit 0 = valid, Exit 1 = invalid with error messages

set -e

ARCH_FILE="${1:-.agents/outputs/arch.md}"
ERRORS=""
WARNINGS=""

if [ ! -f "$ARCH_FILE" ]; then
  echo "ERROR: arch.md not found at $ARCH_FILE"
  exit 1
fi

# Check required L1/L2 sections
for section in \
  "Section 1: Contract Artifacts" \
  "Section 2: Architecture Diagram" \
  "Section 3: Technical Decisions" \
  "Section 4: ACS Quality Gate" \
  "Section 5: Stage Plan" \
  "Section 6: Pseudocode"; do
  if ! grep -q "## $section" "$ARCH_FILE"; then
    ERRORS="$ERRORS\n  MISSING: ## $section"
  fi
done

# Check contract artifact files listed in Section 1 actually exist
if grep -q "## Section 1: Contract Artifacts" "$ARCH_FILE"; then
  # Extract file paths (lines starting with "- `path`")
  grep -oE '`[^`]+\.(ts|js|py|go|rs|java|test\.[a-z]+)`' "$ARCH_FILE" | tr -d '`' | while read -r filepath; do
    if [ -n "$filepath" ] && [ ! -f "$filepath" ]; then
      echo "  WARNING: Contract artifact not found: $filepath" >&2
    fi
  done
fi

# Check stage plan has required fields
if grep -q "## Section 5: Stage Plan" "$ARCH_FILE"; then
  stage_count=$(grep -c "^### Stage [0-9]" "$ARCH_FILE" || true)
  if [ "$stage_count" -eq 0 ]; then
    ERRORS="$ERRORS\n  MISSING: No stages found in Section 5"
  else
    for field in "Scope" "Files" "Completion Gate" "Contract Tests" "NOT in Scope"; do
      field_count=$(grep -c "\*\*$field\*\*" "$ARCH_FILE" || true)
      if [ "$field_count" -lt "$stage_count" ]; then
        ERRORS="$ERRORS\n  INCOMPLETE: Stage field '$field' found $field_count times (expected $stage_count for $stage_count stages)"
      fi
    done
  fi
else
  ERRORS="$ERRORS\n  MISSING: Stage plan section entirely absent"
fi

# Report results
if [ -n "$ERRORS" ]; then
  echo "VALIDATION FAILED for $ARCH_FILE"
  printf "Errors:%b\n" "$ERRORS"
  exit 1
else
  echo "VALIDATION PASSED for $ARCH_FILE"
  exit 0
fi
