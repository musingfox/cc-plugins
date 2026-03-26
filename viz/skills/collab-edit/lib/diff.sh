#!/usr/bin/env bash
# diff.sh
# Show diff between original and edited files using delta or fallback to diff -u

set -euo pipefail

# Check arguments
if [ $# -ne 2 ]; then
    echo "Usage: $0 <original-file> <edited-file>" >&2
    exit 1
fi

ORIGINAL="$1"
EDITED="$2"

# Check if both files exist
if [ ! -f "$ORIGINAL" ]; then
    echo "Error: Original file not found: $ORIGINAL" >&2
    exit 1
fi

if [ ! -f "$EDITED" ]; then
    echo "Error: Edited file not found: $EDITED" >&2
    exit 1
fi

# Check if files are identical
if diff -q "$ORIGINAL" "$EDITED" > /dev/null 2>&1; then
    echo "No changes detected"
    exit 1
fi

# Check if delta is available
if command -v delta > /dev/null 2>&1; then
    delta "$ORIGINAL" "$EDITED" || true
else
    # Fallback to plain diff
    diff -u "$ORIGINAL" "$EDITED" || true
fi

exit 0
