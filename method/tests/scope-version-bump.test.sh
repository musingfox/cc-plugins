#!/usr/bin/env bash
# The scope gate must not charge a builder for the plugin version bump that
# .githooks/pre-commit stages into its first commit touching a plugin, and must
# still charge it for any other edit to that plugin.json.
#
# Drives the REAL scope-gate.sh over a REAL git repo: what counts as "only the
# version changed" is decided by the git command the gate runs.

. "$METHOD_TESTS_DIR/lib/assert.sh"
. "$METHOD_TESTS_DIR/lib/repo.sh"

SCOPE="$(cd "$METHOD_TESTS_DIR/../scripts" && pwd)/scope-gate.sh"
MANIFEST="foo/.claude-plugin/plugin.json"

# build_fixture -- the contract declares only foo/skill.md; plugin.json exists at base.
build_fixture() {
  new_repo
  mkdir -p "$REPO/foo/.claude-plugin"
  write_manifest 0.1.0 "Foo plugin"
  commit_all base
  BASE="$(head_sha)"
  write_contracts '[{"name":"C1","touches_files":["foo/skill.md"]}]'
  echo skill > "$REPO/foo/skill.md"
}

# write_manifest VERSION DESCRIPTION
write_manifest() {
  cat > "$REPO/$MANIFEST" <<EOM
{
  "name": "foo",
  "version": "$1",
  "description": "$2"
}
EOM
}

commit() { commit_all "$1"; }

run_scope() {
  scope_out=$(bash "$SCOPE" --repo "$REPO" --base "$BASE" --head HEAD --contracts "$CONTRACTS" 2>&1)
  scope_rc=$?
}

# T1: the hook's version-only bump is a warning, not a violation.
build_fixture
write_manifest 0.1.1 "Foo plugin"
commit "feat: skill"
run_scope
assert_eq "0" "$scope_rc" "T1 version-only bump exits 0"
assert_eq "ALLOWLISTED $MANIFEST" "$scope_out" "T1 version-only bump is reported as allowlisted"
drop_repo

# T2: any other field in the same file is still the builder's undeclared touch.
build_fixture
write_manifest 0.1.1 "Foo plugin, now louder"
commit "feat: skill"
run_scope
assert_eq "2" "$scope_rc" "T2 non-version edit exits 2"
assert_eq "UNDECLARED $MANIFEST" "$scope_out" "T2 non-version edit is undeclared"
drop_repo

# T3: commit union, not net diff -- a bump in one commit does not launder a
# non-version edit made in another, even one reverted later.
build_fixture
write_manifest 0.1.1 "Foo plugin"
commit "feat: skill"
write_manifest 0.1.1 "Changed"
commit "chore: tweak"
write_manifest 0.1.1 "Foo plugin"
commit "chore: revert tweak"
run_scope
assert_eq "2" "$scope_rc" "T3 a non-version edit in any commit exits 2"
assert_eq "UNDECLARED $MANIFEST" "$scope_out" "T3 non-version edit across commits is undeclared"
drop_repo

# T4: a plugin.json the builder creates is not a bump.
build_fixture
mkdir -p "$REPO/bar/.claude-plugin"
printf '{\n  "version": "0.1.0"\n}\n' > "$REPO/bar/.claude-plugin/plugin.json"
commit "feat: new plugin"
run_scope
assert_eq "2" "$scope_rc" "T4 new plugin.json exits 2"
assert_eq "UNDECLARED bar/.claude-plugin/plugin.json" "$scope_out" "T4 new plugin.json is undeclared"
drop_repo

# T5: several bumps across commits are still only version lines.
build_fixture
write_manifest 0.1.1 "Foo plugin"
commit "feat: skill"
write_manifest 0.1.2 "Foo plugin"
commit "fix: skill"
run_scope
assert_eq "0" "$scope_rc" "T5 two bumps exit 0"
assert_eq "ALLOWLISTED $MANIFEST" "$scope_out" "T5 two bumps are allowlisted"
drop_repo

# T6: a declared plugin.json is declared, not allowlisted.
build_fixture
write_manifest 0.1.1 "Foo plugin, now louder"
commit "feat: skill"
write_contracts "[{\"name\":\"C1\",\"touches_files\":[\"foo/skill.md\",\"$MANIFEST\"]}]"
run_scope
assert_eq "0" "$scope_rc" "T6 declared manifest exits 0"
assert_eq "" "$scope_out" "T6 declared manifest prints nothing"
drop_repo

# T7: the allowlisted manifest sorts in with the build/lock manifests on one line,
# and an undeclared file next to it still exits 2.
build_fixture
write_manifest 0.1.1 "Foo plugin"
echo '{}' > "$REPO/package.json"
echo rogue > "$REPO/rogue.txt"
commit "feat: skill"
run_scope
assert_eq "ALLOWLISTED $MANIFEST,package.json
UNDECLARED rogue.txt" "$scope_out" "T7 manifest and build/lock share the ALLOWLISTED line"
assert_eq "2" "$scope_rc" "T7 exit 2 for the undeclared file"
drop_repo

# T8: only the top-level "version" key is the hook's. A nested object's "version"
# line changing alongside it is the builder's edit.
build_fixture
mkdir -p "$REPO/p/.claude-plugin"
cat > "$REPO/p/.claude-plugin/plugin.json" <<EOM
{
  "name": "p",
  "version": "1.0.0",
  "dependencies": {
    "q": {
      "version": 1
    }
  }
}
EOM
commit_all "feat: plugin p"
BASE="$(head_sha)"
write_contracts '[{"name":"C1","touches_files":[]}]'
cat > "$REPO/p/.claude-plugin/plugin.json" <<EOM
{
  "name": "p",
  "version": "1.0.1",
  "dependencies": {
    "q": {
      "version": "^9"
    }
  }
}
EOM
commit "chore: bump"
run_scope
assert_eq "2" "$scope_rc" "T8 nested version change exits 2"
assert_eq "UNDECLARED p/.claude-plugin/plugin.json" "$scope_out" "T8 nested version change is undeclared"
drop_repo
