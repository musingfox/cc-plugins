#!/bin/bash
# render.sh — Render a markdown file as formatted HTML and open in browser
# Usage: render.sh <markdown-file> <output-name>

set -euo pipefail

INPUT_FILE="$1"
OUTPUT_NAME="$2"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: File not found: $INPUT_FILE" >&2
    exit 1
fi

SCRIPT_DIR="$(dirname "$0")"
TEMPLATE="$SCRIPT_DIR/template.html"

if [ ! -f "$TEMPLATE" ]; then
    echo "Error: Template not found: $TEMPLATE" >&2
    exit 1
fi

# Base64 encode the markdown content (macOS compatible)
B64_FILE=$(mktemp)
base64 -i "$INPUT_FILE" > "$B64_FILE"

# Generate timestamp and output path
TIMESTAMP=$(date +%y%m%d%H%M%S)
OUTPUT_FILE="/tmp/${OUTPUT_NAME}-${TIMESTAMP}.html"

# Use Python for placeholder replacement (handles long base64 strings safely)
python3 -c "
import sys
tmpl = open(sys.argv[1]).read()
b64 = open(sys.argv[2]).read().strip()
name = sys.argv[3]
print(tmpl.replace('DOC_BASE64_PLACEHOLDER', b64).replace('DOC_NAME_PLACEHOLDER', name))
" "$TEMPLATE" "$B64_FILE" "$OUTPUT_NAME" > "$OUTPUT_FILE"

# Clean up temp file
rm -f "$B64_FILE"

# Open in browser
open "$OUTPUT_FILE"

echo "$OUTPUT_FILE"
