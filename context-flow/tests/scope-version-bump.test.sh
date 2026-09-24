#!/usr/bin/env bash
# The scope gate must not charge a shard for the plugin version bump that
# .githooks/pre-commit stages into its first commit touching a plugin, and must
# still charge it for any other edit to that plugin.json.
#
# Drives the REAL cf-pi-scope.sh over a REAL git repo: what counts as "only the
# version changed" is decided by the git command the gate runs.

. "$CF_TESTS_DIR/lib/assert.sh"

REAL_SCRIPTS="$(cd "$CF_TESTS_DIR/../scripts" && pwd)"
MANIFEST="foo/.claude-plugin/plugin.json"

# build_fixture — shard S declares only foo/skill.md; plugin.json exists at base.
build_fixture() {
  FLOW="$(mktemp -d)"
  SHARD="$FLOW/shards/S"
  WORK="$SHARD/work"
  mkdir -p "$WORK/foo/.claude-plugin"
  cat > "$FLOW/shards.json" <<'JSON'
{"groups": {"S": {"contracts": ["C1"], "files": ["foo/skill.md"]}}}
JSON
  git -C "$WORK" init -q -b main && git -C "$WORK" config core.hooksPath /dev/null
  git -C "$WORK" config user.email t@t; git -C "$WORK" config user.name t
  write_manifest 0.1.0 "Foo plugin"
  git -C "$WORK" add -A; git -C "$WORK" commit -qm base
  local base; base="$(git -C "$WORK" rev-parse HEAD)"
  cat > "$SHARD/env.sh" <<EOF
SESSION="$SHARD"
SESSION_BASENAME="test-shard-S"
FLOW_SESSION="$FLOW"
SHARD_ID="S"
BASE_HEAD="$base"
EOF
  echo skill > "$WORK/foo/skill.md"
}

# write_manifest VERSION DESCRIPTION
write_manifest() {
  cat > "$WORK/$MANIFEST" <<EOF
{
  "name": "foo",
  "version": "$1",
  "description": "$2"
}
EOF
}

commit() { git -C "$WORK" add -A; git -C "$WORK" commit -qm "$1"; }

run_scope() {
  scope_out=$(bash "$REAL_SCRIPTS/cf-pi-scope.sh" "$SHARD" 2>&1)
  scope_rc=$?
}

# T1: the hook's version-only bump is a warning, not a violation.
build_fixture
write_manifest 0.1.1 "Foo plugin"
commit "feat: skill"
run_scope
assert_eq "0" "$scope_rc" "T1 version-only bump exits 0"
assert_eq "ALLOWLISTED $MANIFEST" "$scope_out" "T1 version-only bump is reported as allowlisted"
rm -rf "$FLOW"

# T2: any other field in the same file is still the shard's undeclared touch.
build_fixture
write_manifest 0.1.1 "Foo plugin, now louder"
commit "feat: skill"
run_scope
assert_eq "2" "$scope_rc" "T2 non-version edit exits 2"
assert_eq "UNDECLARED $MANIFEST" "$scope_out" "T2 non-version edit is undeclared"
rm -rf "$FLOW"

# T3: commit union, not net diff — a bump in one commit does not launder a
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
rm -rf "$FLOW"

# T4: a plugin.json the shard creates is not a bump.
build_fixture
mkdir -p "$WORK/bar/.claude-plugin"
printf '{\n  "version": "0.1.0"\n}\n' > "$WORK/bar/.claude-plugin/plugin.json"
commit "feat: new plugin"
run_scope
assert_eq "2" "$scope_rc" "T4 new plugin.json exits 2"
assert_eq "UNDECLARED bar/.claude-plugin/plugin.json" "$scope_out" "T4 new plugin.json is undeclared"
rm -rf "$FLOW"
