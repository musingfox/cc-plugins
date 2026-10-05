#!/usr/bin/env bash
# The scope gate and the revert gate read the same "paths this shard touched"
# list, so the three shapes that once split them -- a rename, a name git
# C-quotes, a directory turned into a file -- get the same answer from both.
# Real git fixtures, real scripts.
# NO set -e

. "$CF_TESTS_DIR/lib/assert.sh"

SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"

# new_shard DECLARED_JSON_ARRAY [EXTRA_C1_FIELDS]: an empty shard A whose one
# contract C1 touches DECLARED. Callers build the base commit, then call
# shard_begins.
new_shard() {
  FLOW="$(mktemp -d)"
  SHARD="$FLOW/shards/A"
  WORK="$SHARD/work"
  mkdir -p "$WORK"
  git -C "$WORK" init -q -b main
  git -C "$WORK" config core.hooksPath /dev/null
  git -C "$WORK" config user.email t@t
  git -C "$WORK" config user.name t
  printf '{"schema_version":1,"contracts":[{"name":"C1","touches_files":%s%s}]}\n' "$1" "${2:+,$2}" >"$FLOW/contracts.json"
  printf '{"groups":{"A":{"contracts":["C1"],"files":%s}}}\n' "$1" >"$FLOW/shards.json"
}

commit_all() { git -C "$WORK" add -A && git -C "$WORK" commit -qm "$1"; }

shard_begins() {
  BASE_HEAD="$(git -C "$WORK" rev-parse HEAD)"
  cat >"$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-shard-A"
FLOW_SESSION="$FLOW"
SHARD_ID="A"
REPO_ROOT="$WORK"
BASE_HEAD="$BASE_HEAD"
EOF
}

scope() { SCOPE_OUT="$(bash "$SCRIPTS/cf-pi-scope.sh" "$SHARD" 2>&1)"; SCOPE_RC=$?; }
revert() { GATE_OUT="$(bash "$SCRIPTS/cf-pi-revert-gate.sh" "$SHARD" bash -c "$1" 2>/dev/null)"; GATE_RC=$?; }

# --- T1: renaming an undeclared file onto a declared name --------------------
# The old path is gone from the tree, so it is a touch the shard never declared.
new_shard '["src/new.sh"]'
mkdir -p "$WORK/src"; echo 'echo old' >"$WORK/src/old.sh"; commit_all base
shard_begins
git -C "$WORK" mv src/old.sh src/new.sh; commit_all rename
scope
assert_eq "2" "$SCOPE_RC" "T1 scope: rename charges the undeclared old path"
assert_contains "$SCOPE_OUT" "src/old.sh" "T1 scope: names src/old.sh"
revert '[ -f src/new.sh ]'
assert_eq "CLEAN 1" "$GATE_OUT" "T1 revert gate: putting the rename back goes red"
rm -rf "$FLOW"

# --- T2: a declared name git C-quotes ---------------------------------------
new_shard '["src/a\"b.sh"]'
mkdir -p "$WORK/src"; echo base >"$WORK/base.txt"; commit_all base
shard_begins
echo 'echo q' >"$WORK/src/a\"b.sh"; commit_all quoted
scope
assert_eq "0" "$SCOPE_RC" "T2 scope: a quoted declared name is in scope ($SCOPE_OUT)"
revert '[ -f "src/a\"b.sh" ]'
assert_eq "CLEAN 1" "$GATE_OUT" "T2 revert gate: the quoted file is put back"
rm -rf "$FLOW"

# --- T3: a directory turned into a file of the same name ---------------------
new_shard '["src/d","src/d/x.sh"]'
mkdir -p "$WORK/src/d"; echo 'echo x' >"$WORK/src/d/x.sh"; commit_all base
shard_begins
git -C "$WORK" rm -rq src/d; mkdir -p "$WORK/src"; echo 'echo d' >"$WORK/src/d"; commit_all dir-to-file
scope
assert_eq "0" "$SCOPE_RC" "T3 scope: both declared paths are in scope ($SCOPE_OUT)"
revert '[ -f src/d ]'
assert_eq "CLEAN 1" "$GATE_OUT" "T3 revert gate: reaches a verdict"
assert_eq "file" "$([ -f "$WORK/src/d" ] && echo file || echo other)" "T3 revert gate: restores the shard's file"
rm -rf "$FLOW"

# --- T4: the reverse, a file turned into a directory -------------------------
new_shard '["src/d","src/d/x.sh"]'
mkdir -p "$WORK/src"; echo 'echo d' >"$WORK/src/d"; commit_all base
shard_begins
git -C "$WORK" rm -q src/d; mkdir -p "$WORK/src/d"; echo 'echo x' >"$WORK/src/d/x.sh"; commit_all file-to-dir
scope
assert_eq "0" "$SCOPE_RC" "T4 scope: both declared paths are in scope ($SCOPE_OUT)"
revert '[ -f src/d/x.sh ]'
assert_eq "CLEAN 1" "$GATE_OUT" "T4 revert gate: reaches a verdict"
assert_eq "file" "$([ -f "$WORK/src/d/x.sh" ] && echo file || echo other)" "T4 revert gate: restores the shard's tree"
rm -rf "$FLOW"

# --- T5: one list and one allowlist, defined once ----------------------------
assert_eq "0" "$(grep -c 'BUILD_LOCK_ALLOWLIST=' "$SCRIPTS/cf-pi-scope.sh" "$SCRIPTS/cf-pi-revert-gate.sh" | awk -F: '{s+=$2} END {print s}')" \
  "T5 neither gate defines its own build/lock allowlist"
assert_eq "0" "$(grep -c 'log .*--name-only' "$SCRIPTS/cf-pi-scope.sh" "$SCRIPTS/cf-pi-revert-gate.sh" | awk -F: '{s+=$2} END {print s}')" \
  "T5 neither gate lists its own paths"

# --- T6: the contract, not the path, says which files are its tests ---------
# spec/scripts/x.sh is implementation (the spec plugin's own layout); a path
# rule reading */spec/* as a test would never revert it and call C1 vacuous.
new_shard '["spec/scripts/x.sh","tests/x.test.sh"]' '"test_files":["tests/x.test.sh"]'
echo base >"$WORK/base.txt"; commit_all base
shard_begins
mkdir -p "$WORK/spec/scripts" "$WORK/tests"
echo 'echo x' >"$WORK/spec/scripts/x.sh"
echo '[ "$(bash spec/scripts/x.sh)" = x ]' >"$WORK/tests/x.test.sh"
commit_all spec-impl
revert 'bash tests/x.test.sh'
assert_eq "CLEAN 1" "$GATE_OUT" "T6 revert gate: a declared test_files list overrides the path rule"
rm -rf "$FLOW"
