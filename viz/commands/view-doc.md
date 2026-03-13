---
description: Render a document as formatted HTML
argument-hint: "[file-path or plan-name]"
allowed-tools: ["Bash", "Read"]
---

# View Document Command

Renders a markdown document as formatted HTML with syntax highlighting, math formulas, Mermaid diagrams, and animations, then opens it in your browser.

## Usage

- `/view-doc` - List available plans from `~/.claude/plans/` and show usage hint
- `/view-doc <plan-name>` - Open a plan file by name (backward compatible with `/view-plan`)
- `/view-doc /path/to/file.md` - Open any markdown file by path

## Implementation

### Step 1: Resolve File Path

Use bash to determine the input file:

```bash
INPUT="$ARGUMENTS"
PLANS_DIR="$HOME/.claude/plans"

if [ -z "$INPUT" ]; then
    # No argument: list available plans and show usage
    echo "Available plans in $PLANS_DIR:"
    ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -20 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  - /'
    echo ""
    echo "Usage:"
    echo "  /view-doc <plan-name>       Open a plan file"
    echo "  /view-doc /path/to/file.md  Open any markdown file"
    exit 0
elif [ -f "$INPUT" ]; then
    # Direct file path exists
    DOC_FILE="$INPUT"
    DOC_NAME=$(basename "$DOC_FILE" .md)
elif echo "$INPUT" | grep -qE '[/~]|\.md$'; then
    # Looks like a path but doesn't exist
    # Expand ~ if present
    EXPANDED=$(eval echo "$INPUT")
    if [ -f "$EXPANDED" ]; then
        DOC_FILE="$EXPANDED"
        DOC_NAME=$(basename "$DOC_FILE" .md)
    else
        echo "File not found: $INPUT"
        exit 1
    fi
else
    # Bare name: try as plan file (backward compat)
    DOC_FILE="$PLANS_DIR/$INPUT.md"
    DOC_NAME="$INPUT"
    if [ ! -f "$DOC_FILE" ]; then
        echo "Plan file not found: $INPUT.md"
        echo ""
        echo "Available plans:"
        ls -t "$PLANS_DIR"/*.md 2>/dev/null | head -10 | xargs -n1 basename | sed 's/\.md$//' | sed 's/^/  - /'
        exit 1
    fi
fi

echo "Reading: $DOC_FILE"
```

### Step 2: Render as HTML

Run the render script via Bash:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" "$DOC_FILE" "doc-$DOC_NAME"
```

The script handles base64 encoding, HTML generation, and opening in the browser.
