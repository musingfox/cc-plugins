#!/usr/bin/env bash
# run.sh's output contract, exercised on fixtures so the real suite is not
# run a second time from inside itself.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

runner="$PWD/diagnose/tests/run.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git -C "$tmp" init -q
mkdir "$tmp/tests"
cp "$runner" "$tmp/tests/run.sh"

printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/tests/a.test.sh"
printf '#!/usr/bin/env bash\nexit 1\n' > "$tmp/tests/b.test.sh"

set +e
out="$(cd / && bash "$tmp/tests/run.sh" 2>&1)"
rc=$?
set -e
[ "$rc" -eq 1 ] || fail "T1: one failing fixture must exit 1, got $rc"
printf '%s\n' "$out" | grep -qx 'ok   - a.test.sh' || fail "T2: passing fixture must report ok"
printf '%s\n' "$out" | grep -qx 'not ok - b.test.sh' || fail "T3: failing fixture must report not ok"
printf '%s\n' "$out" | grep -qx 'tests: 2, failed: 1' || fail "T4: totals must count both fixtures and one failure"
[ "$(printf '%s\n' "$out" | tail -n 1)" = 'test_exit=1' ] || fail "T5: last line must be test_exit=1"

printf '#!/usr/bin/env bash\nexit 0\n' > "$tmp/tests/b.test.sh"
set +e
out="$(cd / && bash "$tmp/tests/run.sh" 2>&1)"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "T6: all-green fixtures must exit 0, got $rc"
[ "$(printf '%s\n' "$out" | tail -n 1)" = 'test_exit=0' ] || fail "T7: last line must be test_exit=0"
printf '%s\n' "$out" | grep -qx 'tests: 2, failed: 0' || fail "T8: totals must report zero failures"

echo "ok - runner.test.sh"
