#!/bin/bash
# render.sh — Render a markdown file as formatted HTML
# Usage: render.sh <markdown-file> <output-name>
# Output: /tmp/viz/{project-name}/{output-name}-{timestamp}.html

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

# Determine project name from working directory
PROJECT_NAME="$(basename "$PWD")"
OUTPUT_DIR="/tmp/viz/${PROJECT_NAME}"
mkdir -p "$OUTPUT_DIR"

# Base64 encode the markdown content (macOS compatible)
B64_FILE=$(mktemp)
base64 -i "$INPUT_FILE" > "$B64_FILE"

# Generate timestamp and output path
TIMESTAMP=$(date +%y%m%d%H%M%S)
OUTPUT_FILE="${OUTPUT_DIR}/${OUTPUT_NAME}-${TIMESTAMP}.html"

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

SERVE_PATH="/${PROJECT_NAME}/${OUTPUT_NAME}-${TIMESTAMP}.html"
VIZ_PORT=18080

if [ -n "${SSH_CLIENT:-}" ] || [ -n "${SSH_CONNECTION:-}" ]; then
    # Remote session: start server if not running, print URL
    if ! lsof -i :"$VIZ_PORT" -sTCP:LISTEN &>/dev/null; then
        python3 -m http.server "$VIZ_PORT" -d /tmp/viz/ -b 0.0.0.0 &>/dev/null &
        echo $! > /tmp/viz/.server.pid
    fi
    TS_IP=$(tailscale ip -4 2>/dev/null || echo "localhost")
    echo "$OUTPUT_FILE"
    echo "URL: http://${TS_IP}:${VIZ_PORT}${SERVE_PATH}"
else
    # Local session: open in browser
    open "$OUTPUT_FILE" 2>/dev/null || true
    echo "$OUTPUT_FILE"
fi
