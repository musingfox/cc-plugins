#!/usr/bin/env bash
# The scope gate and the revert gate read the same "paths the builder touched"
# list, so the three shapes that once split them -- a rename, a name git
# C-quotes, a directory turned into a file -- get the same answer from both.
# Real git fixtures, real scripts.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"
. "$METHOD_TESTS_DIR/lib/repo.sh"

SCRIPTS="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)"
GATE="$SCRIPTS/revert-gate.sh"

# new_fixture DECLARED_JSON_ARRAY [EXTRA_C1_FIELDS]: an empty repo whose one
# contract C1 touches DECLARED. Callers build the base commit, then call begins.
new_fixture() {
  new_repo
  write_contracts "$(printf '[{"name":"C1","touches_files":%s%s}]' "$1" "${2:+,$2}")"
}
begins() { BASE="$(head_sha)"; }

scope() {
  SCOPE_OUT="$(bash "$SCRIPTS/scope-gate.sh" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" 2>&1)"
  SCOPE_RC=$?
}
revert() { gate_run bash -c "$1"; }

# --- T1: renaming an undeclared file onto a declared name --------------------
# The old path is gone from the tree, so it is a touch the builder never declared.
new_fixture '["src/new.sh"]'
mkdir -p "$REPO/src"; echo 'echo old' >"$REPO/src/old.sh"; commit_all base
begins
git -C "$REPO" mv src/old.sh src/new.sh; commit_all rename
scope
assert_eq "2" "$SCOPE_RC" "T1 scope: rename charges the undeclared old path"
assert_contains "$SCOPE_OUT" "src/old.sh" "T1 scope: names src/old.sh"
revert '[ -f src/new.sh ]'
assert_eq "CLEAN 1" "$GATE_LAST" "T1 revert gate: putting the rename back goes red"
drop_repo

# --- T2: a declared name git C-quotes ---------------------------------------
new_fixture '["src/a\"b.sh"]'
mkdir -p "$REPO/src"; echo base >"$REPO/base.txt"; commit_all base
begins
echo 'echo q' >"$REPO/src/a\"b.sh"; commit_all quoted
scope
assert_eq "0" "$SCOPE_RC" "T2 scope: a quoted declared name is in scope ($SCOPE_OUT)"
revert '[ -f "src/a\"b.sh" ]'
assert_eq "CLEAN 1" "$GATE_LAST" "T2 revert gate: the quoted file is put back"
drop_repo

# --- T3: a directory turned into a file of the same name ---------------------
new_fixture '["src/d","src/d/x.sh"]'
mkdir -p "$REPO/src/d"; echo 'echo x' >"$REPO/src/d/x.sh"; commit_all base
begins
git -C "$REPO" rm -rq src/d; mkdir -p "$REPO/src"; echo 'echo d' >"$REPO/src/d"; commit_all dir-to-file
scope
assert_eq "0" "$SCOPE_RC" "T3 scope: both declared paths are in scope ($SCOPE_OUT)"
revert '[ -f src/d ]'
assert_eq "CLEAN 1" "$GATE_LAST" "T3 revert gate: reaches a verdict"
assert_eq "file" "$([ -f "$REPO/src/d" ] && echo file || echo other)" "T3 revert gate: DIR keeps the builder's file"
drop_repo

# --- T4: the reverse, a file turned into a directory -------------------------
new_fixture '["src/d","src/d/x.sh"]'
mkdir -p "$REPO/src"; echo 'echo d' >"$REPO/src/d"; commit_all base
begins
git -C "$REPO" rm -q src/d; mkdir -p "$REPO/src/d"; echo 'echo x' >"$REPO/src/d/x.sh"; commit_all file-to-dir
scope
assert_eq "0" "$SCOPE_RC" "T4 scope: both declared paths are in scope ($SCOPE_OUT)"
revert '[ -f src/d/x.sh ]'
assert_eq "CLEAN 1" "$GATE_LAST" "T4 revert gate: reaches a verdict"
assert_eq "file" "$([ -f "$REPO/src/d/x.sh" ] && echo file || echo other)" "T4 revert gate: DIR keeps the builder's tree"
drop_repo

# --- T5: one allowlist, the same in both gates ---------------------------------
# The revert gate never reverts what the scope gate allows; each script carries
# its own copy of the regex, so the copies must not drift.
allowlist_of() { sed -n "s/^METHOD_BUILD_LOCK_ALLOWLIST=//p" "$1"; }
assert_eq "1" "$(allowlist_of "$SCRIPTS/scope-gate.sh" | grep -c .)" "T5 the scope gate defines the allowlist once"
assert_eq "1" "$(allowlist_of "$SCRIPTS/revert-gate.sh" | grep -c .)" "T5 the revert gate defines the allowlist once"
assert_eq "$(allowlist_of "$SCRIPTS/scope-gate.sh")" "$(allowlist_of "$SCRIPTS/revert-gate.sh")" \
  "T5 the scope gate's build/lock allowlist is the revert gate's"

# --- T6: the same list of own paths, by the same git command -----------------
# Both read the commit union with rename detection off and NUL separators.
for g in scope-gate.sh revert-gate.sh; do
  line="$(grep -E 'log -z .*--no-renames .*--name-only' "$SCRIPTS/$g")"
  assert_eq "1" "$(printf '%s\n' "$line" | grep -c .)" "T6 $g lists own paths with log -z --no-renames --name-only"
done

# --- T7: the contract, not the path, says which files are its tests ---------
# spec/scripts/x.sh is implementation (the spec plugin's own layout); a path
# rule reading */spec/* as a test would never revert it and call C1 vacuous.
new_fixture '["spec/scripts/x.sh","tests/x.test.sh"]' '"test_files":["tests/x.test.sh"]'
echo base >"$REPO/base.txt"; commit_all base
begins
mkdir -p "$REPO/spec/scripts" "$REPO/tests"
echo 'echo x' >"$REPO/spec/scripts/x.sh"
echo '[ "$(bash spec/scripts/x.sh)" = x ]' >"$REPO/tests/x.test.sh"
commit_all spec-impl
revert 'bash tests/x.test.sh'
assert_eq "CLEAN 1" "$GATE_LAST" "T7 revert gate: a declared test_files list overrides the path rule"
scope
assert_eq "0" "$SCOPE_RC" "T7 scope: both files declared"
drop_repo
