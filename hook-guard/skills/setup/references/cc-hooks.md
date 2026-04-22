# Claude Code Hooks Reference

Write hooks into `.claude/settings.local.json` using this format:

```json
{
  "env": { "CLAUDECODE": "1" },
  "hooks": {
    "EventName": [
      { "matcher": "ToolPattern", "hooks": [{ "type": "command", "command": "..." }] }
    ]
  }
}
```

Always include `env.CLAUDECODE=1` — it enables the pre-commit skip logic.

## PostToolUse — Lint & Format (soft, always `exit 0`)

Matcher: `"Edit|Write"`. File path available as `$CLAUDE_TOOL_ARG_file_path`.

Single-language commands:

- **Python (ruff)**: `ruff check --fix "$CLAUDE_TOOL_ARG_file_path" 2>&1; ruff format "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0`
- **Python (black+flake8)**: `black "$CLAUDE_TOOL_ARG_file_path" 2>&1; flake8 "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0`
- **JS/TS (eslint+prettier)**: `npx prettier --write "$CLAUDE_TOOL_ARG_file_path" 2>&1; npx eslint --fix "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0`
- **JS/TS (biome)**: `npx biome check --write "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0`
- **Rust**: `rustfmt "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0` (clippy is crate-level, skip per-file)
- **Go**: `gofmt -w "$CLAUDE_TOOL_ARG_file_path" 2>&1; exit 0`

Multi-language dispatch:

```bash
case "$CLAUDE_TOOL_ARG_file_path" in
  *.py) ruff check --fix "$CLAUDE_TOOL_ARG_file_path" 2>&1; ruff format "$CLAUDE_TOOL_ARG_file_path" 2>&1 ;;
  *.js|*.ts|*.jsx|*.tsx) npx prettier --write "$CLAUDE_TOOL_ARG_file_path" 2>&1; npx eslint --fix "$CLAUDE_TOOL_ARG_file_path" 2>&1 ;;
  *.rs) rustfmt "$CLAUDE_TOOL_ARG_file_path" 2>&1 ;;
  *.go) gofmt -w "$CLAUDE_TOOL_ARG_file_path" 2>&1 ;;
esac
exit 0
```

## PreToolUse — Test Gate (hard gate on commit)

Matcher: `"Bash"`. Only gate `git|jj commit`:

```bash
CMD="$CLAUDE_TOOL_ARG_command"
echo "$CMD" | grep -qE '^\s*(git|jj)\s+commit' || exit 0
echo "Running tests before commit..."
[TEST_COMMAND] 2>&1 || { echo "Tests failed. Commit blocked."; exit 1; }
exit 0
```

Test commands: Python `pytest`; JS/TS `npx vitest run` / `npx jest` / `npm test`; Rust `cargo test`; Go `go test ./...`.

## Merging with Existing Settings

1. Read/parse existing JSON.
2. Deep-merge `hooks` arrays (append entries under matching events; never overwrite).
3. Merge `env` (add keys; never overwrite existing).
4. Preserve `permissions`, `allowedTools`, `disallowedTools`, etc.

Prefer `jq`; otherwise Read → modify → Write.
