#!/usr/bin/env bash
# Run every pi-dispatch and context-flow test suite from one command.
#
# Usage: bash tests/run-all.sh [ROOT]   (ROOT defaults to the repo root)
#
# Order: each pi-dispatch/tests/*.sh, the bun suite in pi-dispatch/extensions/,
# context-flow/tests/run.sh, then each tests/*.test.sh. One "ok   - <suite>" or
# "not ok - <suite>" line per suite, then "suites: N, failed: M" as the last
# line. Exit 0 only when M is 0. A missing suite directory or a missing bun is
# a failure, never a skip. Deliberately no test_exit= line: cf-pi-test.sh adds
# its own, and the summary must stay the last line.

set -uo pipefail

ROOT="${1:-$(dirname "${BASH_SOURCE[0]}")/..}"
ROOT="$(cd "$ROOT" && pwd)" || { echo "not ok - root ${1:-} (missing)"; echo "suites: 1, failed: 1"; exit 1; }

# Suites append to the pi-runs ledger; keep fixture runs out of the real one.
SCRATCH="$(mktemp -d)"
export PI_RUNS_DIR="$SCRATCH/pi-runs"
trap 'rm -rf "$SCRATCH"' EXIT

shopt -s nullglob
total=0
failed=0

report() {
  total=$((total + 1))
  if [ "$1" -eq 0 ]; then
    echo "ok   - $2"
  else
    echo "not ok - $2"
    failed=$((failed + 1))
  fi
}

if [ -d "$ROOT/pi-dispatch/tests" ]; then
  for f in "$ROOT"/pi-dispatch/tests/*.sh; do
    (cd "$ROOT/pi-dispatch" && bash "$f"); report $? "pi-dispatch/tests/$(basename "$f")"
  done
else
  report 1 "pi-dispatch/tests (missing)"
fi

if ! command -v bun >/dev/null 2>&1; then
  report 1 "bun test (bun not found)"
else
  # bun treats path arguments as filters over its cwd, so run it inside the dir.
  (cd "$ROOT/pi-dispatch/extensions" && bun test); report $? "bun test pi-dispatch/extensions/"
fi

bash "$ROOT/context-flow/tests/run.sh"; report $? "context-flow/tests/run.sh"

for f in "$ROOT"/tests/*.test.sh; do
  (cd "$ROOT" && bash "$f"); report $? "tests/$(basename "$f")"
done

echo "---"
echo "suites: $total, failed: $failed"
[ "$failed" -eq 0 ]
