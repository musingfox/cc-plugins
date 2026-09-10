#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

runner="$PWD/obsidian-workspace/tests/run.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git -C "$tmp" init -q
mkdir "$tmp/tests"
cp "$runner" "$tmp/tests/run.sh"
printf '#!/usr/bin/env bash\nexit 1\n' > "$tmp/tests/x.test.sh"

set +e
out="$(cd / && bash "$tmp/tests/run.sh" 2>&1)"
rc=$?
set -e
printf '%s\n' "$out" | grep -q 'not ok - x.test.sh' || fail "failing fixture must report not ok"
printf '%s\n' "$out" | grep -q 'failed: 1' || fail "totals must report failed: 1"
[ "$(printf '%s\n' "$out" | tail -n 1)" = 'test_exit=1' ] || fail "last line must be test_exit=1"
[ "$rc" -eq 1 ] || fail "failing fixture must exit 1, got $rc"

for f in obsidian-workspace/tests/*.test.sh; do
  n="$(head -3 "$f" | grep -c 'cd "$(git rev-parse --show-toplevel)"' || true)"
  [ "$n" -eq 1 ] || fail "$f: head -3 must contain cd \"\$(git rev-parse --show-toplevel)\" exactly once"
  n="$(grep -c '  ✗ ' "$f" || true)"
  [ "$n" -ge 1 ] || fail "$f: must contain at least one '  ✗ '"
done
