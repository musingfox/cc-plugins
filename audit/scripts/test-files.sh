#!/usr/bin/env bash
# List a repo's test files, in every language, as repo-relative paths.
set -euo pipefail

[ $# -ge 1 ] || { echo "usage: test-files.sh <repo>" >&2; exit 1; }
repo="$1"

# An inherited GIT_DIR would bind git to the caller's repo, not <repo>.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

[ "$(git -C "$repo" rev-parse --is-inside-work-tree 2>/dev/null)" = true ] \
  || { echo "not a git repository: $repo" >&2; exit 1; }

ext='(sh|bash|ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rb|rs)'
base='(^|/)([^/]*\.test\.'$ext'|[^/]*\.spec\.'$ext'|[^/]*-test\.'$ext'|[^/]*_test\.'$ext'|[^/]*_spec\.'$ext'|test_[^/]*\.'$ext'|[^/]*\.bats)$'
dirs='(^|/)__tests__/.*\.'$ext'$'

git -C "$repo" ls-files -z --cached --others --exclude-standard | tr '\0' '\n' \
  | { grep -E "$base|$dirs" || true; } \
  | LC_ALL=C sort -u
