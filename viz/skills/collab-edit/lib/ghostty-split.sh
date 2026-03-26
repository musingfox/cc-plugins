#!/usr/bin/env bash
# ghostty-split.sh
# Creates a new Ghostty split and opens an editor with the specified command

set -euo pipefail

# Check if editor command is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <editor-command>" >&2
    exit 1
fi

EDITOR_CMD="$1"

# Check if running in Ghostty
if [ "${TERM_PROGRAM:-}" != "ghostty" ]; then
    # Fallback: check if Ghostty process exists (match full command line)
    if ! pgrep -f "Ghostty.app" > /dev/null 2>&1; then
        echo "Error: Ghostty is not running" >&2
        exit 1
    fi
fi

# AppleScript: save clipboard, paste command, restore clipboard
osascript <<EOF
-- Save original clipboard
set origClip to the clipboard

tell application "ghostty"
    activate
end tell

delay 0.3

-- Set clipboard to editor command
set the clipboard to "${EDITOR_CMD}"

tell application "System Events"
    tell process "ghostty"
        set frontmost to true

        -- Send cmd+d to create new split
        keystroke "d" using command down

        -- Wait for split to be ready
        delay 0.5

        -- Paste from clipboard (bypasses input method)
        keystroke "v" using command down

        delay 0.1

        -- Press Enter to execute
        keystroke return
    end tell
end tell

-- Restore original clipboard
delay 0.2
set the clipboard to origClip
EOF

exit 0
