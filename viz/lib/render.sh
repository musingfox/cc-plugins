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

# Absolutize input path so the recipe Save endpoint can write back to it
INPUT_FILE_ABS="$(cd "$(dirname "$INPUT_FILE")" && pwd)/$(basename "$INPUT_FILE")"

SCRIPT_DIR="$(dirname "$0")"
TEMPLATE="$SCRIPT_DIR/template.html"
SERVER_SCRIPT="$SCRIPT_DIR/server.py"

# Recipe dispatch: if the markdown has frontmatter with `viz: <recipe>` and
# a matching recipe template exists, swap the template. Otherwise fall back
# to the generic markdown viewer.
RECIPE=""
if [ "$(head -n 1 "$INPUT_FILE")" = "---" ]; then
    RECIPE=$(sed -n '/^---$/,/^---$/p' "$INPUT_FILE" 2>/dev/null \
        | sed -n 's/^viz:[[:space:]]*\(.*\)$/\1/p' \
        | head -n 1 \
        | tr -d '[:space:]"' \
        | tr -d "'")
fi
if [ -n "$RECIPE" ] && [ -f "$SCRIPT_DIR/recipes/${RECIPE}.html" ]; then
    TEMPLATE="$SCRIPT_DIR/recipes/${RECIPE}.html"
fi

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
# Also honors `// @inline <relative-path>` directives that splice sibling
# files (e.g. recipe model JS) into the template at render time, so the
# HTML and Node tests can share a single source of truth.
python3 -c "
import sys, os, re
tmpl_path = sys.argv[1]
tmpl = open(tmpl_path).read()
b64 = open(sys.argv[2]).read().strip()
name = sys.argv[3]
src_path = sys.argv[4]
src_mtime = ''
if src_path and os.path.isfile(src_path):
    src_mtime = '%.6f' % os.path.getmtime(src_path)
tmpl_dir = os.path.dirname(os.path.abspath(tmpl_path))
def _inline(m):
    rel = m.group(1).strip()
    p = os.path.join(tmpl_dir, rel)
    if not os.path.isfile(p):
        sys.stderr.write('warn: @inline target not found: ' + p + '\n')
        return m.group(0)
    return open(p).read()
tmpl = re.sub(r'^[ \t]*//[ \t]*@inline[ \t]+(\S+)[ \t]*\$', _inline, tmpl, flags=re.MULTILINE)
print(tmpl
    .replace('DOC_BASE64_PLACEHOLDER', b64)
    .replace('DOC_NAME_PLACEHOLDER', name)
    .replace('SOURCE_PATH_PLACEHOLDER', src_path)
    .replace('SOURCE_MTIME_PLACEHOLDER', src_mtime))
" "$TEMPLATE" "$B64_FILE" "$OUTPUT_NAME" "$INPUT_FILE_ABS" > "$OUTPUT_FILE"

# Clean up temp file
rm -f "$B64_FILE"

SERVE_PATH="/${PROJECT_NAME}/${OUTPUT_NAME}-${TIMESTAMP}.html"
VIZ_PORT="${VIZ_PORT:-18090}"
export VIZ_PORT

# Start (or verify) the viz server. Used for SSH (always) and recipes (Save endpoint).
start_viz_server() {
    local bind_host="$1"
    # Healthy viz server already running?
    if curl -sf "http://127.0.0.1:${VIZ_PORT}/api/health" >/dev/null 2>&1; then
        return 0
    fi
    # Stale viz pid? Kill it before re-binding.
    if [ -f /tmp/viz/.server.pid ]; then
        kill "$(cat /tmp/viz/.server.pid)" 2>/dev/null || true
        sleep 0.2
        rm -f /tmp/viz/.server.pid
    fi
    # Port held by something else (not us)? Bail; caller falls back.
    if lsof -i :"$VIZ_PORT" -sTCP:LISTEN &>/dev/null; then
        return 1
    fi
    if [ -f "$SERVER_SCRIPT" ]; then
        nohup python3 "$SERVER_SCRIPT" "$bind_host" >/tmp/viz/.server.log 2>&1 &
        echo $! > /tmp/viz/.server.pid
    else
        # Fallback: read-only static server (no Save support)
        nohup python3 -m http.server "$VIZ_PORT" -d /tmp/viz/ -b "$bind_host" >/dev/null 2>&1 &
        echo $! > /tmp/viz/.server.pid
    fi
    for _ in 1 2 3 4 5 6 7 8 9 10; do
        sleep 0.1
        if curl -sf "http://127.0.0.1:${VIZ_PORT}/api/health" >/dev/null 2>&1; then
            return 0
        fi
        # If fallback server is running, /api/health 404s but the port is up
        if lsof -i :"$VIZ_PORT" -sTCP:LISTEN &>/dev/null; then
            return 0
        fi
    done
    return 1
}

if [ -n "${SSH_CLIENT:-}" ] || [ -n "${SSH_CONNECTION:-}" ]; then
    start_viz_server 0.0.0.0 || true
    TS_IP=$(tailscale ip -4 2>/dev/null || echo "localhost")
    echo "$OUTPUT_FILE"
    echo "URL: http://${TS_IP}:${VIZ_PORT}${SERVE_PATH}"
elif [ -n "$RECIPE" ]; then
    # Recipes need the Save endpoint — open via http:// so fetch() works
    if start_viz_server 127.0.0.1; then
        open "http://127.0.0.1:${VIZ_PORT}${SERVE_PATH}" 2>/dev/null || true
        echo "$OUTPUT_FILE"
        echo "URL: http://127.0.0.1:${VIZ_PORT}${SERVE_PATH}"
    else
        # Server failed (port held by other process) — fall back to file://;
        # Save will fail gracefully and the recipe still works via Export.
        open "$OUTPUT_FILE" 2>/dev/null || true
        echo "$OUTPUT_FILE"
        echo "Warning: viz server unavailable — Save disabled, use Export" >&2
    fi
else
    open "$OUTPUT_FILE" 2>/dev/null || true
    echo "$OUTPUT_FILE"
fi
