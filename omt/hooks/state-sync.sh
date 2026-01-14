#!/usr/bin/env bash
#
# PostToolUse Hook: State Synchronization
#
# Automatically syncs important tool outputs to state.json and jj metadata.
# Triggered after each tool use to maintain workflow state.
#
# Hook Event: PostToolUse
# Prompt Patterns:
#   - "update state with"
#   - "record agent completion"
#   - "save validation result"
#

set -euo pipefail

# Get hook payload
TOOL_NAME="${CLAUDE_HOOK_TOOL_NAME:-}"
TOOL_RESULT="${CLAUDE_HOOK_TOOL_RESULT:-}"
CONVERSATION_DIR="${CLAUDE_CONVERSATION_DIR:-}"

# Only process Write tool calls to state.json or outputs/
if [[ "$TOOL_NAME" == "Write" ]]; then
  # Extract file path from tool result
  FILE_PATH=$(echo "$TOOL_RESULT" | grep -oP 'File (?:created|updated) successfully at: \K.*' || true)

  if [[ -z "$FILE_PATH" ]]; then
    exit 0
  fi

  # Check if this is a state.json or outputs/ file
  if [[ "$FILE_PATH" =~ \.agents/state\.json$ ]] || [[ "$FILE_PATH" =~ outputs/.*\.md$ ]]; then
    # Extract base name for agent identification
    AGENT_NAME=$(basename "$FILE_PATH" .md)

    # Create jj bookmark for this state update
    if command -v jj &> /dev/null; then
      TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

      # Check if we're in outputs/
      if [[ "$FILE_PATH" =~ outputs/ ]]; then
        jj bookmark create "agent-${AGENT_NAME}-${TIMESTAMP}" 2>/dev/null || true

        # Add metadata to jj description
        METADATA=$(cat <<EOF
Agent Output: @${AGENT_NAME}

Timestamp: ${TIMESTAMP}
Output: ${FILE_PATH}

Automatic bookmark created by OMT state-sync hook.
EOF
)
        jj describe -m "$METADATA" 2>/dev/null || true
      fi
    fi

    # Log the state update
    echo "✓ State synced: $FILE_PATH" >&2
  fi
fi

exit 0
