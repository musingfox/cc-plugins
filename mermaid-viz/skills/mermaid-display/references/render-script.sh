#!/bin/sh
# Canonical Mermaid render script — single source of truth
# Used by: mermaid-display skill, diagram command
#
# Prerequisites:
#   - INPUT_FILE must already exist (written via Write tool)
#   - MERMAID_OUTPUT_FORMAT env var (optional, default: png)
#   - MERMAID_COLOR_SCHEME env var (optional, default: default)
#   - MERMAID_PRIMARY_COLOR, MERMAID_SECONDARY_COLOR, MERMAID_TEXT_COLOR (for custom scheme)

# === Tool Selection ===
if command -v mmdc > /dev/null 2>&1; then
    MERMAID_CMD="mmdc"
elif command -v npx > /dev/null 2>&1; then
    MERMAID_CMD="npx -y @mermaid-js/mermaid-cli"
else
    echo "Error: No mermaid renderer available. Install Node.js or mermaid-cli."
    exit 1
fi

# === Configuration ===
TIMESTAMP=$(date +%s)
INPUT_FILE="${INPUT_FILE:-/tmp/mermaid-diagram-${TIMESTAMP}.mmd}"
FORMAT=${MERMAID_OUTPUT_FORMAT:-png}
OUTPUT_FILE="/tmp/mermaid-diagram-${TIMESTAMP}.${FORMAT}"
SCHEME=${MERMAID_COLOR_SCHEME:-default}

# === Theme Configuration ===
TEMP_CONFIG=""
if [ "$SCHEME" != "default" ]; then
    TEMP_CONFIG="/tmp/mermaid-config-${TIMESTAMP}.json"

    case "$SCHEME" in
        tokyo-night)
            cat > "$TEMP_CONFIG" <<'CONF'
{"theme":"base","themeVariables":{"primaryColor":"#7aa2f7","secondaryColor":"#bb9af7","primaryTextColor":"#c0caf5","background":"transparent","lineColor":"#565f89","tertiaryColor":"#9ece6a","primaryBorderColor":"#565f89","secondaryBorderColor":"#565f89","tertiaryBorderColor":"#565f89"}}
CONF
            ;;
        nord)
            cat > "$TEMP_CONFIG" <<'CONF'
{"theme":"base","themeVariables":{"primaryColor":"#88c0d0","secondaryColor":"#81a1c1","primaryTextColor":"#eceff4","background":"transparent","lineColor":"#4c566a","tertiaryColor":"#a3be8c","primaryBorderColor":"#4c566a","secondaryBorderColor":"#4c566a","tertiaryBorderColor":"#4c566a"}}
CONF
            ;;
        catppuccin-mocha)
            cat > "$TEMP_CONFIG" <<'CONF'
{"theme":"base","themeVariables":{"primaryColor":"#89b4fa","secondaryColor":"#cba6f7","primaryTextColor":"#cdd6f4","background":"transparent","lineColor":"#6c7086","tertiaryColor":"#a6e3a1","primaryBorderColor":"#6c7086","secondaryBorderColor":"#6c7086","tertiaryBorderColor":"#6c7086"}}
CONF
            ;;
        catppuccin-latte)
            cat > "$TEMP_CONFIG" <<'CONF'
{"theme":"base","themeVariables":{"primaryColor":"#1e66f5","secondaryColor":"#8839ef","primaryTextColor":"#4c4f69","background":"transparent","lineColor":"#9ca0b0","tertiaryColor":"#40a02b","primaryBorderColor":"#9ca0b0","secondaryBorderColor":"#9ca0b0","tertiaryBorderColor":"#9ca0b0"}}
CONF
            ;;
        dracula)
            cat > "$TEMP_CONFIG" <<'CONF'
{"theme":"base","themeVariables":{"primaryColor":"#bd93f9","secondaryColor":"#ff79c6","primaryTextColor":"#f8f8f2","background":"transparent","lineColor":"#6272a4","tertiaryColor":"#50fa7b","primaryBorderColor":"#6272a4","secondaryBorderColor":"#6272a4","tertiaryBorderColor":"#6272a4"}}
CONF
            ;;
        github-dark)
            cat > "$TEMP_CONFIG" <<'CONF'
{"theme":"base","themeVariables":{"primaryColor":"#58a6ff","secondaryColor":"#79c0ff","primaryTextColor":"#c9d1d9","background":"transparent","lineColor":"#30363d","tertiaryColor":"#56d364","primaryBorderColor":"#30363d","secondaryBorderColor":"#30363d","tertiaryBorderColor":"#30363d"}}
CONF
            ;;
        github-light)
            cat > "$TEMP_CONFIG" <<'CONF'
{"theme":"base","themeVariables":{"primaryColor":"#0969da","secondaryColor":"#0550ae","primaryTextColor":"#24292f","background":"transparent","lineColor":"#d0d7de","tertiaryColor":"#1a7f37","primaryBorderColor":"#d0d7de","secondaryBorderColor":"#d0d7de","tertiaryBorderColor":"#d0d7de"}}
CONF
            ;;
        solarized-dark)
            cat > "$TEMP_CONFIG" <<'CONF'
{"theme":"base","themeVariables":{"primaryColor":"#268bd2","secondaryColor":"#2aa198","primaryTextColor":"#839496","background":"transparent","lineColor":"#586e75","tertiaryColor":"#859900","primaryBorderColor":"#586e75","secondaryBorderColor":"#586e75","tertiaryBorderColor":"#586e75"}}
CONF
            ;;
        custom)
            PRIMARY=${MERMAID_PRIMARY_COLOR:-#7aa2f7}
            SECONDARY=${MERMAID_SECONDARY_COLOR:-#bb9af7}
            TEXT=${MERMAID_TEXT_COLOR:-#c0caf5}
            cat > "$TEMP_CONFIG" <<CONF
{"theme":"base","themeVariables":{"primaryColor":"$PRIMARY","secondaryColor":"$SECONDARY","primaryTextColor":"$TEXT","background":"transparent","lineColor":"#565f89","primaryBorderColor":"#565f89","secondaryBorderColor":"#565f89"}}
CONF
            ;;
        *)
            SCHEME="default"
            ;;
    esac
fi

# === Render ===
if [ "$SCHEME" = "default" ]; then
    $MERMAID_CMD -i "$INPUT_FILE" -o "$OUTPUT_FILE" -b transparent
else
    $MERMAID_CMD -i "$INPUT_FILE" -o "$OUTPUT_FILE" -c "$TEMP_CONFIG" -b transparent
    rm -f "$TEMP_CONFIG"
fi

echo "$OUTPUT_FILE"

# === Open in viewer ===
OS=$(uname -s)
case "$OS" in
  Darwin)   open "$OUTPUT_FILE" ;;
  Linux)    xdg-open "$OUTPUT_FILE" ;;
  MINGW*|MSYS*|CYGWIN*) start "$OUTPUT_FILE" ;;
  *)        echo "Diagram saved to: $OUTPUT_FILE" ;;
esac
