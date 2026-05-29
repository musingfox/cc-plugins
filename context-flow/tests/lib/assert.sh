#!/usr/bin/env bash
# Shared assertion helpers for context-flow shell tests.
#
# Usage in a *.test.sh file:
#     . "$CF_TESTS_DIR/lib/assert.sh"
#     assert_eq "expected" "$actual" "what this checks"
#     assert_contains "$haystack" "needle"
#     assert_exit 0 some_command --with args
#     assert_json result.json '.status' "PASS"
#
# Do NOT use `set -e` in test files — assertions accumulate and the EXIT trap
# below exits nonzero if any failed. Each failing assertion prints a line
# beginning with "  ✗ " (matches cf-pi-integrate.sh's failure grep).

__ASSERT_COUNT=0
__ASSERT_FAIL=0

_assert_pass() { __ASSERT_COUNT=$((__ASSERT_COUNT + 1)); }
_assert_fail() {
  __ASSERT_COUNT=$((__ASSERT_COUNT + 1))
  __ASSERT_FAIL=$((__ASSERT_FAIL + 1))
  echo "  ✗ $1"
}

# assert_eq EXPECTED ACTUAL [MSG]
assert_eq() {
  local want="$1" got="$2" msg="${3:-}"
  if [ "$want" = "$got" ]; then
    _assert_pass
  else
    _assert_fail "${msg:-assert_eq}: expected [$want] got [$got]"
  fi
}

# assert_contains HAYSTACK NEEDLE [MSG]
assert_contains() {
  local hay="$1" needle="$2" msg="${3:-}"
  case "$hay" in
    *"$needle"*) _assert_pass ;;
    *) _assert_fail "${msg:-assert_contains}: [$needle] not found in [$hay]" ;;
  esac
}

# assert_exit EXPECTED_CODE COMMAND [ARGS...]
# Runs the command without aborting the test on nonzero exit.
assert_exit() {
  local want="$1"; shift
  local got=0
  if "$@" >/dev/null 2>&1; then got=0; else got=$?; fi
  if [ "$got" -eq "$want" ]; then
    _assert_pass
  else
    _assert_fail "assert_exit: expected exit $want got $got from: $*"
  fi
}

# assert_json FILE JQ_FILTER EXPECTED [MSG]
assert_json() {
  local file="$1" filter="$2" want="$3" msg="${4:-}"
  if [ ! -f "$file" ]; then
    _assert_fail "${msg:-assert_json}: file not found: $file"
    return
  fi
  local got
  got=$(jq -r "$filter" "$file" 2>/dev/null)
  if [ "$got" = "$want" ]; then
    _assert_pass
  else
    _assert_fail "${msg:-assert_json}: $filter in $(basename "$file") expected [$want] got [$got]"
  fi
}

_assert_summary_on_exit() {
  local rc=$?
  if [ "$__ASSERT_FAIL" -gt 0 ]; then
    echo "  ($__ASSERT_FAIL/$__ASSERT_COUNT assertions failed)"
    exit 1
  fi
  # No assertion failures: preserve any nonzero rc from a crashed test body.
  exit "$rc"
}
trap _assert_summary_on_exit EXIT
