#!/usr/bin/env bash
# cf-pi-setup.sh records the builder choice once, as CF_IMPLEMENTER in env.sh.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

SETUP="$CF_TESTS_DIR/../scripts/cf-pi-setup.sh"
README="$CF_TESTS_DIR/../README.md"
CREATED=()

cleanup() { [ "${#CREATED[@]}" -eq 0 ] || rm -rf "${CREATED[@]}"; }
trap 'rc=$?; cleanup; (exit "$rc"); _assert_summary_on_exit' EXIT

# run_setup VALUE|-  -> sets SESSION and ERR (stderr text); "-" leaves CF_IMPLEMENTER unset
run_setup() {
  local errf; errf="$(mktemp)"
  if [ "$1" = "-" ]; then
    SESSION="$(env -u CF_IMPLEMENTER -u PI_DISPATCH_CMD bash "$SETUP" 2>"$errf")"
  else
    SESSION="$(env -u PI_DISPATCH_CMD CF_IMPLEMENTER="$1" bash "$SETUP" 2>"$errf")"
  fi
  ERR="$(cat "$errf")"; rm -f "$errf"
  CREATED+=("$SESSION")
}

# sourced SESSION VAR -> value after sourcing env.sh in a clean shell
sourced() { env -i bash -c '. "$1/env.sh"; printf %s "${!2}"' _ "$1" "$2"; }

run_setup -
assert_eq "CF_IMPLEMENTER=claude" "$(grep '^CF_IMPLEMENTER=' "$SESSION/env.sh")" "T1 unset records claude"
assert_eq "claude" "$(sourced "$SESSION" CF_IMPLEMENTER)" "T1b sourcing gives claude"
case "$ERR" in *CF_IMPLEMENTER*) assert_eq "no-warning" "warned" "T1c no CF_IMPLEMENTER stderr line" ;;
  *) assert_eq "ok" "ok" "T1c no CF_IMPLEMENTER stderr line" ;; esac
T1_SESSION="$SESSION"

run_setup omp
assert_eq "omp" "$(sourced "$SESSION" CF_IMPLEMENTER)" "T2 omp is recorded"
assert_eq "0" "$(sourced "$SESSION" PI_AVAILABLE)" "T2b omp choice is independent of PI_AVAILABLE"

run_setup grok
assert_eq "claude" "$(sourced "$SESSION" CF_IMPLEMENTER)" "T3 unknown value records claude"
assert_contains "$ERR" "CF_IMPLEMENTER=grok is not claude or omp" "T3b unknown value warns on stderr"

# T4: env.sh is the record -- a later live CF_IMPLEMENTER does not override it.
printf 'CF_IMPLEMENTER=omp\n' >> "$T1_SESSION/env.sh"
assert_eq "omp" "$(env CF_IMPLEMENTER=claude bash -c '. "$1/env.sh"; printf %s "$CF_IMPLEMENTER"' _ "$T1_SESSION")" \
  "T4 env.sh assignment beats the live environment"

assert_contains "$(cat "$README")" "CF_IMPLEMENTER=omp" "T5 README documents CF_IMPLEMENTER=omp"

# T7: pi-dispatch is a hard dependency -- every builder's worktree comes from it.
# Without it setup stops at once instead of letting Research, Plan and the
# Human Gate run before §3.0 fails.
LONE="$(mktemp -d /tmp/cf-lone-XXXXXX)"; mkdir -p "$LONE/a/cf/scripts"
cp "$CF_TESTS_DIR/../scripts/cf-pi-setup.sh" "$CF_TESTS_DIR/../scripts/cf-pi-env.sh" "$LONE/a/cf/scripts/"
errf="$(mktemp)"
out="$(env -u CLAUDE_PLUGIN_ROOT -u PI_DISPATCH_CMD bash "$LONE/a/cf/scripts/cf-pi-setup.sh" 2>"$errf")"; rc=$?
[ -n "$out" ] && CREATED+=("$out")
assert_eq "4" "$rc" "T7 missing pi-dispatch exits 4"
assert_eq "" "$out" "T7b no session is created"
assert_contains "$(cat "$errf")" "pi-dispatch plugin not found" "T7c stderr names the missing plugin"
rm -rf "$LONE" "$errf"

cleanup
bad=0
for d in "${CREATED[@]}"; do [ -e "$d" ] && bad=$((bad + 1)); done
assert_eq "0" "$bad" "T6 test-created sessions removed"
CREATED=()
