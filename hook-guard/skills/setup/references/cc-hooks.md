# Claude Code Hooks Reference

This document defines the Claude Code hooks patterns to generate. Use it when writing into `.claude/settings.local.json`.

## Claude Code Settings Format

Configure Claude Code hooks in `.claude/settings.local.json` (project-level) or `~/.claude/settings.json` (user-level). Use this format:

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolPattern",
        "hooks": [
          {
            "type": "command",
            "command": "shell command here"
          }
        ]
      }
    ]
  }
}
```

## CLAUDECODE Environment Variable

Add to settings to enable pre-commit skip logic:

```json
{
  "env": {
    "CLAUDECODE": "1"
  }
}
```

This env var is set in all Bash commands Claude Code runs. When Claude runs `git commit`, the pre-commit hook sees `CLAUDECODE=1` and skips redundant checks. Always include this in generated settings.

## PostToolUse — Lint & Format (Soft Feedback)

Matcher: `"Edit|Write"` — triggers after any file edit or write.

Build the hook command to:
1. Detect the file extension from the tool output
2. Run the appropriate linter/formatter
3. Exit 0 always (soft feedback — output goes to Claude as context, never blocks)

### Language-specific commands

**Python (ruff)**:
```bash
ruff check --fix "$CLAUDE_TOOL_ARG_file_path" 2>&1; ruff format "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0
```

**Python (flake8 + black)**:
```bash
black "$CLAUDE_TOOL_ARG_file_path" 2>&1; flake8 "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0
```

**JavaScript/TypeScript (eslint + prettier)**:
```bash
npx prettier --write "$CLAUDE_TOOL_ARG_file_path" 2>&1; npx eslint --fix "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0
```

**JavaScript/TypeScript (biome)**:
```bash
npx biome check --write "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0
```

**Rust (clippy + rustfmt)**:
```bash
rustfmt "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0
```
Note: clippy operates on crate level, not single files. Only run rustfmt on individual files.

**Go (gofmt + golangci-lint)**:
```bash
gofmt -w "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0
```

### Multi-language projects

For projects with multiple languages, use a dispatch script that checks file extension:

```bash
case "$CLAUDE_TOOL_ARG_file_path" in
  *.py) ruff check --fix "$CLAUDE_TOOL_ARG_file_path" 2>&1; ruff format "$CLAUDE_TOOL_ARG_file_path" 2>&1 ;;
  *.js|*.ts|*.jsx|*.tsx) npx prettier --write "$CLAUDE_TOOL_ARG_file_path" 2>&1; npx eslint --fix "$CLAUDE_TOOL_ARG_file_path" 2>&1 ;;
  *.rs) rustfmt "$CLAUDE_TOOL_ARG_file_path" 2>&1 ;;
  *.go) gofmt -w "$CLAUDE_TOOL_ARG_file_path" 2>&1 ;;
esac
exit 0
```

## PreToolUse — Test Gate (Hard Gate)

Matcher: `"Bash"` — triggers before any Bash command.

This is a hard gate that inspects the command. Use type `"command"` with a script that checks if the command is a git/jj commit and, if so, runs tests first.

```bash
#!/usr/bin/env bash
# Read the command from CLAUDE_TOOL_ARG_command
CMD="$CLAUDE_TOOL_ARG_command"

# Only gate on commit commands
if ! echo "$CMD" | grep -qE '^\s*(git|jj)\s+commit'; then
  exit 0
fi

# Run tests
echo "Running tests before commit..."
[TEST_COMMAND] 2>&1
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
  echo "Tests failed. Commit blocked."
  exit 1
fi

exit 0
```

Replace `[TEST_COMMAND]` with the project's test runner.

### Language-specific test commands

- **Python**: `pytest` or `python -m pytest`
- **JavaScript/TypeScript**: `npx vitest run` or `npx jest` or `npm test`
- **Rust**: `cargo test`
- **Go**: `go test ./...`

## Merging with Existing Settings

When `.claude/settings.local.json` already exists:

1. Read and parse the existing JSON
2. Deep-merge the `hooks` arrays — append new hook entries to existing event arrays, do NOT overwrite
3. Merge the `env` object — add new keys, do NOT overwrite existing env vars
4. Write back the merged result
5. Preserve all other settings (`permissions`, `allowedTools`, `disallowedTools`, etc.)

Use `jq` if available. Otherwise read with the Read tool, modify in-memory, and write with the Write tool.

## Complete Example

For a Python project with ruff + pytest:

```json
{
  "env": {
    "CLAUDECODE": "1"
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "ruff check --fix \"$CLAUDE_TOOL_ARG_file_path\" 2>&1; ruff format \"$CLAUDE_TOOL_ARG_file_path\" 2>&1; exit 0"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "CMD=\"$CLAUDE_TOOL_ARG_command\"; if ! echo \"$CMD\" | grep -qE '^\\s*(git|jj)\\s+commit'; then exit 0; fi; echo 'Running tests...'; pytest 2>&1; exit $?"
          }
        ]
      }
    ]
  }
}
```
