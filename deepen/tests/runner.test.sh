#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

runner="$PWD/deepen/tests/run.sh"

run_pair() {
  local a_rc="$1" b_rc="$2"
  local tmp out rc
  tmp="$(mktemp -d)"
  git -C "$tmp" init -q
  mkdir "$tmp/tests"
  cp "$runner" "$tmp/tests/run.sh"
  printf '#!/usr/bin/env bash\nexit %s\n' "$a_rc" > "$tmp/tests/a.test.sh"
  printf '#!/usr/bin/env bash\nexit %s\n' "$b_rc" > "$tmp/tests/b.test.sh"
  set +e
  out="$(cd / && bash "$tmp/tests/run.sh" 2>&1)"
  rc=$?
  set -e
  rm -rf "$tmp"
  printf '%s\n' "$out"
  return "$rc"
}

out="$(run_pair 0 1)" || rc=$?
rc="${rc:-0}"
printf '%s\n' "$out" | grep -q 'ok   - a.test.sh' || fail "T1: stdout must contain ok   - a.test.sh"
printf '%s\n' "$out" | grep -q 'not ok - b.test.sh' || fail "T1: stdout must contain not ok - b.test.sh"
printf '%s\n' "$out" | grep -q 'tests: 2, failed: 1' || fail "T1: stdout must contain tests: 2, failed: 1"
[ "$(printf '%s\n' "$out" | tail -n 1)" = 'test_exit=1' ] || fail "T1: last line must be test_exit=1"
[ "$rc" -eq 1 ] || fail "T1: exit code must be 1, got $rc"

rc=0
out="$(run_pair 0 0)" || rc=$?
printf '%s\n' "$out" | grep -q 'tests: 2, failed: 0' || fail "T2: stdout must contain tests: 2, failed: 0"
[ "$(printf '%s\n' "$out" | tail -n 1)" = 'test_exit=0' ] || fail "T2: last line must be test_exit=0"
[ "$rc" -eq 0 ] || fail "T2: exit code must be 0, got $rc"
