#!/usr/bin/env bash
# README gate usage: the README states how scope-gate behaves on a clean range and
# how to run a subdirectory suite through revert-gate, and both claims hold.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"
. "$METHOD_TESTS_DIR/lib/repo.sh"

SCRIPTS="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)"
README="$METHOD_TESTS_DIR/../README.md"

# T1: clean range -> README says so; scope-gate is silent, exit 0
row="$(grep '^| `scripts/scope-gate.sh`' "$README")"
assert_contains "$row" 'On a clean range it prints nothing and exits 0.' "T1 README row"

new_repo
echo keep >"$REPO/keep.txt"; commit_all base
BASE="$(head_sha)"
echo x >"$REPO/a.txt"; commit_all work
write_contracts '[{"name":"C1","touches_files":["a.txt"]}]'
out="$(bash "$SCRIPTS/scope-gate.sh" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" 2>/dev/null)"
rc=$?
assert_eq "" "$out" "T1 stdout"
assert_eq 0 "$rc" "T1 exit"
drop_repo

# T2: suite in sub/ through bash -c 'cd sub && ...'
cmd="-- bash -c 'cd muster && bun test'"
block_hit="$(awk -v c="$cmd" '/^```/{f=!f; if(!f){if(h&&n)print "yes"; h=0;n=0}; next} f{if(index($0,"revert-gate.sh"))n=1; if(index($0,c))h=1; if(index($0,"revert-gate.sh")&&index($0,c)){h=1}} END{}' "$README" | head -1)"
assert_eq yes "$block_hit" "T2 README fenced example"

new_repo
mkdir -p "$REPO/sub/src" "$REPO/sub/tests"
echo 'echo base' >"$REPO/keep.sh"
printf '%s\n' 'bash tests/a.sh' >"$REPO/sub/run.sh"
commit_all base
BASE="$(head_sha)"
echo 'echo ok' >"$REPO/sub/src/a.sh"
printf '%s\n' '[ "$(bash src/a.sh)" = ok ]' >"$REPO/sub/tests/a.sh"
commit_all work
write_contracts '[{"name":"C1","touches_files":["sub/src/a.sh","sub/tests/a.sh"],"test_files":["sub/tests/a.sh"]}]'
out="$(bash "$SCRIPTS/revert-gate.sh" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" --out "$OUT" -- bash -c 'cd sub && bash run.sh' 2>/dev/null)"
rc=$?
assert_eq "CLEAN 1" "$(printf '%s\n' "$out" | tail -1)" "T2 last line"
assert_eq 0 "$rc" "T2 exit"
drop_repo
