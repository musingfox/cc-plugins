#!/usr/bin/env bash
# Self-test for run-all.sh. Runs it only against fixture roots (no tests/ dir),
# never against the real tree, so the runner cannot recurse into itself.

set -uo pipefail

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }
check() { if eval "$1"; then ok "$2"; else bad "$2"; fi; }

RUNNER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/run-all.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# An all-passing fixture root: two pi-dispatch suites, one bun test, a cf runner.
fixture() {
  local root="$TMP/$1"
  mkdir -p "$root/pi-dispatch/tests" "$root/pi-dispatch/extensions" "$root/context-flow/tests"
  echo 'exit 0' > "$root/pi-dispatch/tests/ok.sh"
  cat > "$root/pi-dispatch/extensions/ok.test.ts" <<'TS'
import { expect, test } from "bun:test";
test("ok", () => { expect(1).toBe(1); });
TS
  echo 'exit 0' > "$root/context-flow/tests/run.sh"
  echo "$root"
}

run() { OUT="$(bash "$RUNNER" "$1" 2>&1)"; RC=$?; }

# T2: a failing pi-dispatch suite is named and counted.
F="$(fixture t2)"; echo 'exit 1' > "$F/pi-dispatch/tests/bad.sh"
run "$F"
check '[ "$RC" -eq 1 ]' "T2 failing pi-dispatch suite exits 1"
check 'grep -qx "not ok - pi-dispatch/tests/bad.sh" <<<"$OUT"' "T2 names the failing suite"
check 'grep -q "failed: 1" <<<"$OUT"' "T2 counts one failure"

# T3: a failing context-flow runner fails the whole run.
F="$(fixture t3)"; echo 'exit 1' > "$F/context-flow/tests/run.sh"
run "$F"
check '[ "$RC" -eq 1 ]' "T3 failing context-flow runner exits 1"

# T4: a failing bun expect fails the whole run.
F="$(fixture t4)"
cat > "$F/pi-dispatch/extensions/x.test.ts" <<'TS'
import { expect, test } from "bun:test";
test("x", () => { expect(1).toBe(2); });
TS
run "$F"
check '[ "$RC" -eq 1 ]' "T4 failing bun test exits 1"

# T5: without bun on PATH the bun suite fails instead of being skipped.
NOBUN=""
IFS=: read -r -a dirs <<<"$PATH"
for d in "${dirs[@]}"; do
  [ -x "$d/bun" ] || NOBUN="${NOBUN:+$NOBUN:}$d"
done
F="$(fixture t5)"
OUT="$(PATH="$NOBUN" bash "$RUNNER" "$F" 2>&1)"; RC=$?
check '[ "$RC" -eq 1 ]' "T5 missing bun exits 1"
check 'grep -q "bun not found" <<<"$OUT"' "T5 reports bun not found"

# T6: suites see a scratch PI_RUNS_DIR that is gone once the runner exits.
F="$(fixture t6)"
cat > "$F/pi-dispatch/tests/runs-dir.sh" <<'SH'
echo "PI_RUNS_DIR=$PI_RUNS_DIR"
[ -d "$(dirname "$PI_RUNS_DIR")" ]
SH
run "$F"
RUNS="$(sed -n 's/^PI_RUNS_DIR=//p' <<<"$OUT")"
check '[ "$RC" -eq 0 ]' "T6 scratch dir exists while suites run"
check '[ -n "$RUNS" ] && [ "$RUNS" != "$HOME/.cache/pi-runs" ]' "T6 PI_RUNS_DIR is not the real ledger"
check '[ -n "$RUNS" ] && [ ! -e "$(dirname "$RUNS")" ]' "T6 scratch dir removed on exit"

# T7: the result does not depend on the caller's cwd.
F="$(fixture t7)"
OUT="$(cd / && bash "$RUNNER" "$F" 2>&1)"; RC=$?
check '[ "$RC" -eq 0 ]' "T7 all-passing fixture from / exits 0"
check 'grep -q "failed: 0" <<<"$OUT"' "T7 reports failed: 0"

echo "--- run-all: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
