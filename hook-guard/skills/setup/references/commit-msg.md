# commit-msg Hook Reference

Generate as `.githooks/commit-msg` (chmod +x). Receives commit-message file as `$1`.

Format: `<type>(<scope>)?!?: <description>` — types: `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`. Subject ≤ 72 chars. Merge and fixup/squash commits are skipped.

```bash
#!/usr/bin/env bash
set -euo pipefail

COMMIT_MSG_FILE="$1"
COMMIT_MSG=$(head -1 "$COMMIT_MSG_FILE")

echo "$COMMIT_MSG" | grep -qE '^Merge ' && exit 0
echo "$COMMIT_MSG" | grep -qE '^(fixup|squash)! ' && exit 0

PATTERN='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-zA-Z0-9._-]+\))?!?:\s.+'

if ! echo "$COMMIT_MSG" | grep -qE "$PATTERN"; then
  cat <<EOF

hook-guard: Invalid commit message format

  Expected: <type>(<scope>): <description>
  Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert

  Examples:
    feat(auth): add OAuth2 login
    fix: resolve null pointer in parser
    refactor!: drop support for Node 14

  Your message: $COMMIT_MSG

EOF
  exit 1
fi

if [ ${#COMMIT_MSG} -gt 72 ]; then
  echo "hook-guard: Commit subject too long (${#COMMIT_MSG} > 72): $COMMIT_MSG"
  exit 1
fi

exit 0
```

The Co-Authored-By trailer is untouched since only the first line is checked.
