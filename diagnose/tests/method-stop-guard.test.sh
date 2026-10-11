#!/usr/bin/env bash
# Guard: method-stop.test.sh goes red when the Phase 5 stop sentence is made affirmative, duplicated or dropped.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

method="$PWD/diagnose/docs/method.md"
stop_test="$PWD/diagnose/tests/method-stop.test.sh"
sha() { shasum -a 256 "$1" | cut -d' ' -f1; }
before=$(sha "$method")

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch/diagnose/docs" "$scratch/diagnose/tests"
env -u GIT_DIR -u GIT_WORK_TREE git -C "$scratch" init -q
cp "$stop_test" "$scratch/diagnose/tests/method-stop.test.sh"

run_copy() {
  (cd "$scratch" && env -u GIT_DIR -u GIT_WORK_TREE bash diagnose/tests/method-stop.test.sh) >"$scratch/out.log" 2>&1
}

cp "$method" "$scratch/diagnose/docs/method.md"
rc=0
run_copy || rc=$?
[ "$rc" -eq 0 ] || fail "control run exited $rc (broken staging)"

src=$(cat "$method"; printf x)
src=${src%x}

check_case() {
  local name=$1 rc=0
  cmp -s "$scratch/mutant.md" "$method" && fail "mutation $name did not change method.md"
  cp "$scratch/mutant.md" "$scratch/diagnose/docs/method.md"
  run_copy || rc=$?
  [ "$rc" -ne 0 ] || fail "mutation $name passed the stop guard"
  grep -q 'T3' "$scratch/out.log" || fail "mutation $name failed without T3 in output"
}

printf '%s' "${src//"do not apply the fix"/"apply the fix"}" >"$scratch/mutant.md"
check_case affirmative

printf '%s' "${src//"do not apply the fix"/"do apply the fix"}" >"$scratch/mutant.md"
check_case do-apply

awk '{print} /^## Phase 5/{print ""; print "Apply the fix."}' "$method" >"$scratch/mutant.md"
check_case extra-affirmative

printf '%s' "${src//"do not apply the fix"/}" >"$scratch/mutant.md"
check_case deleted

after=$(sha "$method")
[ "$before" = "$after" ] || fail "real method.md changed during the check"
echo "ok   - stop-guard mutations"
