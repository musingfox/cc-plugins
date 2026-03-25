# commit-msg Hook Reference

Conventional commits validation hook. Generate this as `.githooks/commit-msg`.

## Conventional Commits Format

Pattern: `<type>(<optional scope>): <description>`

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

Rules:
- Type is required and must be one of the allowed types
- Scope is optional, enclosed in parentheses
- Colon and space after type (or scope) are required
- Description must start with lowercase
- First line (subject) must be ≤ 72 characters
- Breaking changes indicated by `!` before `:` or `BREAKING CHANGE:` in footer

## commit-msg Hook Script

Generate this as `.githooks/commit-msg`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ========================================
# Hook Guard commit-msg
# Validates conventional commits format
# ========================================

COMMIT_MSG_FILE="$1"
COMMIT_MSG=$(head -1 "$COMMIT_MSG_FILE")

# Skip merge commits
if echo "$COMMIT_MSG" | grep -qE '^Merge '; then
  exit 0
fi

# Skip fixup/squash commits
if echo "$COMMIT_MSG" | grep -qE '^(fixup|squash)! '; then
  exit 0
fi

# Conventional commit pattern
PATTERN='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-zA-Z0-9._-]+\))?!?:\s.+'

if ! echo "$COMMIT_MSG" | grep -qE "$PATTERN"; then
  echo ""
  echo "hook-guard: Invalid commit message format"
  echo ""
  echo "  Expected: <type>(<scope>): <description>"
  echo ""
  echo "  Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"
  echo ""
  echo "  Examples:"
  echo "    feat(auth): add OAuth2 login"
  echo "    fix: resolve null pointer in parser"
  echo "    docs(readme): update installation guide"
  echo "    refactor!: drop support for Node 14"
  echo ""
  echo "  Your message: $COMMIT_MSG"
  echo ""
  exit 1
fi

# Check subject line length (≤ 72 chars)
if [ ${#COMMIT_MSG} -gt 72 ]; then
  echo ""
  echo "hook-guard: Commit subject too long (${#COMMIT_MSG} > 72 characters)"
  echo "  $COMMIT_MSG"
  echo ""
  exit 1
fi

exit 0
```

## Notes

- The hook receives the commit message file path as `$1`
- Must be executable: `chmod +x .githooks/commit-msg`
- Merge commits and fixup/squash commits are skipped automatically
- The Co-Authored-By trailer (added by Claude Code) does not affect validation since only the first line is checked
