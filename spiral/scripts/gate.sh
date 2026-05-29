#!/usr/bin/env bash
# Spiral deterministic gate — PreToolUse hook for Bash(git commit ...).
#
# The "machine" of the Spiral concept: a failing gate means NOT DONE — the commit
# (delivery) is blocked deterministically, not at the model's discretion. The block
# is bypass-proof (exit 2 blocks even under --dangerously-skip-permissions).
#
# Scoping rules (so this never pollutes unrelated commits):
#   - Only acts on `git commit` invocations; any other Bash call → allow (exit 0).
#   - Dormant unless a spiral turn is active (.spiral/active present) → allow.
#   - When active, runs the turn's gate command; PASS → allow (0), FAIL → block (2).
#
# CRITICAL: exit 2 is the ONLY blocking code. exit 1 is treated as a non-blocking
# error and the commit would PROCEED. Never `exit 1` on gate failure.
set -u

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
STATE_DIR="$PROJECT_DIR/.spiral"
ACTIVE="$STATE_DIR/active"

input=$(cat)

# Extract the command being run (jq if available, else fall back to the raw payload).
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null || true)
[ -n "$cmd" ] || cmd="$input"

# Only a `git commit` is our concern; everything else passes untouched.
case "$cmd" in
  *"git commit"*) : ;;
  *) exit 0 ;;
esac

# Dormant unless a spiral turn is active.
[ -f "$ACTIVE" ] || exit 0

gate_cmd=$(cat "$ACTIVE" 2>/dev/null)
[ -n "$gate_cmd" ] || exit 0

# Run the turn's deterministic checks.
if out=$(cd "$PROJECT_DIR" && eval "$gate_cmd" 2>&1); then
  exit 0
fi

# Gate red → BLOCK the commit. stderr is fed back to Claude.
{
  echo "SPIRAL GATE FAILED — commit blocked. A failing gate means not done."
  echo "gate command: $gate_cmd"
  echo "--- last lines of gate output ---"
  printf '%s\n' "$out" | tail -n 40
} >&2
exit 2
