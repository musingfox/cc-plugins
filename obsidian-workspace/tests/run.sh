#!/usr/bin/env bash
# Dependency-free test discovery runner for obsidian-workspace.

set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(git -C "$TESTS_DIR" rev-parse --show-toplevel)"

shopt -s nullglob
total=0
failed=0

for f in "$TESTS_DIR"/*.test.sh; do
  total=$((total + 1))
  name="$(basename "$f")"
  if bash "$f"; then
    echo "ok   - $name"
  else
    echo "not ok - $name"
    failed=$((failed + 1))
  fi
done

echo "---"
echo "tests: $total, failed: $failed"

rc=0
[ "$failed" -eq 0 ] || rc=1
echo "test_exit=$rc"
exit "$rc"
