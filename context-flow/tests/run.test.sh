#!/usr/bin/env bash
# Self-validation for the test harness itself (run.sh + lib/assert.sh).
# Discovered and executed by run.sh like any other *.test.sh.

. "$CF_TESTS_DIR/lib/assert.sh"

# Positive cases.
assert_eq "abc" "abc" "assert_eq matches equal strings"
assert_contains "hello world" "world" "assert_contains finds substring"
assert_exit 0 true "assert_exit captures success"
assert_exit 1 false "assert_exit captures failure"

# assert_json round-trips a real jq read.
tmp="$(mktemp)"
printf '{"status":"PASS","n":3}' > "$tmp"
assert_json "$tmp" '.status' "PASS" "assert_json reads a string field"
assert_json "$tmp" '.n' "3" "assert_json reads a numeric field"
rm -f "$tmp"

# Meta: a failing assertion must make a test file exit nonzero.
assert_exit 1 bash -c ". \"$CF_TESTS_DIR/lib/assert.sh\"; assert_eq 1 2" \
  "a failing assertion yields nonzero exit"

# Meta: a clean test file must exit zero.
assert_exit 0 bash -c ". \"$CF_TESTS_DIR/lib/assert.sh\"; assert_eq ok ok" \
  "a passing assertion yields zero exit"

# Inside a pi worker PATH starts with the git shim, which refuses to run without
# PI_REAL_GIT. The scrub keeps that one fence variable, so fixtures' git works, and
# still drops PI_CWD, so no fixture sees the live worktree.
sandbox="$(mktemp -d)"
mkdir -p "$sandbox/tests/lib" "$sandbox/shim"
cp "$CF_TESTS_DIR/run.sh" "$sandbox/tests/run.sh"
cp "$CF_TESTS_DIR/lib/assert.sh" "$sandbox/tests/lib/assert.sh"
printf '%s\n' '#!/usr/bin/env bash' '[ -n "${PI_REAL_GIT:-}" ] || exit 127' 'exec "$PI_REAL_GIT" "$@"' > "$sandbox/shim/git"
printf '%s\n' '#!/usr/bin/env bash' 'git --version >/dev/null || exit 1' '[ -z "${PI_CWD:-}" ] || exit 2' > "$sandbox/tests/probe.test.sh"
chmod +x "$sandbox/shim/git"
real_git="${PI_REAL_GIT:-$(command -v git)}"
out="$(PATH="$sandbox/shim:$PATH" PI_REAL_GIT="$real_git" PI_CWD="$sandbox" bash "$sandbox/tests/run.sh" 2>&1)"
assert_contains "$out" "ok   - probe.test.sh" "the scrub keeps PI_REAL_GIT for a shimmed git and drops PI_CWD"
rm -rf "$sandbox"
