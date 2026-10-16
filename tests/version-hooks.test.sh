#!/usr/bin/env bash
# Self-checks for .githooks/pre-commit and pre-push. The hooks themselves are not modified.
set -uo pipefail

# A caller inside a git hook exports these; they must not steer the fixture repos.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY \
  GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_COMMON_DIR

export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_NOSYSTEM=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKSDIR="$ROOT/.githooks"

# The runner keeps PATH, which may lead with a git shim that exits unless
# PI_REAL_GIT is set. env -i drops that variable, so prefer a real git binary.
real_git=""
IFS=':' read -r -a _path_dirs <<< "$PATH"
for _dir in "${_path_dirs[@]}"; do
  [ -n "$_dir" ] && [ -x "$_dir/git" ] || continue
  if grep -q 'PI_REAL_GIT' "$_dir/git" 2>/dev/null; then
    continue
  fi
  real_git="$_dir/git"
  break
done
[ -n "$real_git" ] || { printf 'FAIL: no git on PATH\n' >&2; exit 1; }
PATH="$(dirname "$real_git"):$PATH"
export PATH
hash -r 2>/dev/null || true

REAL_HEAD="$(git -C "$ROOT" rev-parse HEAD)"
REAL_REFS="$(git -C "$ROOT" for-each-ref)"

PASS=0
FAIL=0
TMP="$(mktemp -d)"

die() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

ok() {
  PASS=$((PASS + 1))
  printf 'ok   - %s\n' "$1"
}

bad() {
  FAIL=$((FAIL + 1))
  printf 'FAIL - %s\n' "$1"
}

on_exit() {
  local rc=$?
  local head refs
  head="$(git -C "$ROOT" rev-parse HEAD)"
  refs="$(git -C "$ROOT" for-each-ref)"
  if [ "$head" != "$REAL_HEAD" ] || [ "$refs" != "$REAL_REFS" ]; then
    printf 'FAIL: real repo HEAD or for-each-ref changed\n' >&2
    rc=1
  fi
  if [ $((PASS + FAIL)) -eq 0 ]; then
    printf 'FAIL: no checks ran\n' >&2
    rc=1
  fi
  rm -rf "$TMP"
  exit "$rc"
}
trap on_exit EXIT

# new_fixture <hooks-dir>
# Sets FIX_WORK and FIX_BARE: bare origin plus a main work tree with plugin p at 1.0.0, pushed.
new_fixture() {
  local hooks="$1"
  local slot
  slot="$(mktemp -d "$TMP/fix.XXXXXX")"
  FIX_BARE="$slot/bare.git"
  FIX_WORK="$slot/work"
  git init --bare -b main "$FIX_BARE" >/dev/null
  git init -b main "$FIX_WORK" >/dev/null
  git -C "$FIX_WORK" config user.email "dev@example.com"
  git -C "$FIX_WORK" config user.name "Dev"
  git -C "$FIX_WORK" config core.hooksPath "$hooks"
  mkdir -p "$FIX_WORK/p/.claude-plugin"
  cat > "$FIX_WORK/p/.claude-plugin/plugin.json" <<'EOF'
{
  "name": "p",
  "version": "1.0.0",
  "description": "d"
}
EOF
  printf 'a\n' > "$FIX_WORK/p/a.txt"
  git -C "$FIX_WORK" add -A
  git -C "$FIX_WORK" commit -m "feat(p): init" >/dev/null || die "fixture init commit failed"
  git -C "$FIX_WORK" remote add origin "$FIX_BARE"
  git -C "$FIX_WORK" push -u origin main >/dev/null 2>&1 || die "fixture initial push failed"
}

# scenario_bump <hooks-dir>
# One content commit on a pushed 1.0.0 plugin. Echoes single-line observations.
scenario_bump() {
  local hooks="$1"
  local out json ver wt bumped por
  new_fixture "$hooks"
  printf 'b\n' >> "$FIX_WORK/p/a.txt"
  git -C "$FIX_WORK" add -A
  out="$(git -C "$FIX_WORK" commit -m "feat(p): x" 2>&1)" || die "content commit failed: $out"
  json="$(git -C "$FIX_WORK" show HEAD:p/.claude-plugin/plugin.json)"
  ver="$(printf '%s\n' "$json" | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p')"
  wt="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$FIX_WORK/p/.claude-plugin/plugin.json")"
  bumped=0
  printf '%s\n' "$out" | grep -q 'Auto-bumped p version: 1.0.0 -> 1.0.1' && bumped=1
  por="$(git -C "$FIX_WORK" status --porcelain)"
  printf 'version=%s\n' "$ver"
  printf 'wt_version=%s\n' "$wt"
  printf 'bump_line=%s\n' "$bumped"
  if [ -z "$por" ]; then
    printf 'porcelain_empty=1\n'
  else
    printf 'porcelain_empty=0\n'
  fi
}

# scenario_refuse <hooks-dir>
# Content commit with --no-verify, then push. Echoes the push exit code.
scenario_refuse() {
  local hooks="$1"
  local before err ec same
  new_fixture "$hooks"
  before="$(git -C "$FIX_BARE" rev-parse main)"
  printf 'b\n' >> "$FIX_WORK/p/a.txt"
  git -C "$FIX_WORK" add -A
  git -C "$FIX_WORK" commit --no-verify -m "feat(p): x" >/dev/null || die "no-verify content commit failed"
  err="$(mktemp "$TMP/push-refuse.XXXXXX")"
  git -C "$FIX_WORK" push origin main >"$TMP/push-refuse.out" 2>"$err"
  ec=$?
  same=0
  [ "$(git -C "$FIX_BARE" rev-parse main)" = "$before" ] && same=1
  printf 'exit=%s\n' "$ec"
  printf 'remote_same=%s\n' "$same"
  if grep -F -q 'pre-push: p changed in refs/heads/main but p/.claude-plugin/plugin.json version is still 1.0.0' "$err"; then
    printf 'hook_line=1\n'
  else
    printf 'hook_line=0\n'
  fi
}

new_fixture "$HOOKSDIR"
got="$(git -C "$FIX_WORK" config --get core.hooksPath)"
if [ "$got" = "$HOOKSDIR" ]; then
  ok "fixture core.hooksPath is the repo .githooks"
else
  bad "fixture core.hooksPath is the repo .githooks"
fi

if [ -f "$HOOKSDIR/pre-commit" ] && [ -f "$HOOKSDIR/pre-push" ]; then
  ok "repo .githooks has pre-commit and pre-push"
else
  bad "repo .githooks has pre-commit and pre-push"
fi

global="$(git config --global --list 2>/dev/null || true)"
if [ -z "$global" ]; then
  ok "git config --global --list is empty"
else
  bad "git config --global --list is empty"
fi

# A second content commit before any push must not bump again, and amending the
# bump commit with more staged content must keep 1.0.1.
new_fixture "$HOOKSDIR"
printf 'b\n' >> "$FIX_WORK/p/a.txt"
git -C "$FIX_WORK" add -A
git -C "$FIX_WORK" commit -m "feat(p): x" >/dev/null 2>&1 || die "first content commit failed"
printf 'c\n' >> "$FIX_WORK/p/a.txt"
git -C "$FIX_WORK" add -A
second_out="$(git -C "$FIX_WORK" commit -m "feat(p): y" 2>&1)" || die "second content commit failed: $second_out"
if printf '%s\n' "$second_out" | grep -q 'Auto-bumped'; then
  bad "second unpushed content commit has no Auto-bumped line"
else
  ok "second unpushed content commit has no Auto-bumped line"
fi
second_json="$(git -C "$FIX_WORK" show HEAD:p/.claude-plugin/plugin.json)"
if printf '%s\n' "$second_json" | grep -q '"version": "1.0.1"'; then
  ok "second unpushed commit keeps version 1.0.1"
else
  bad "second unpushed commit keeps version 1.0.1"
fi

new_fixture "$HOOKSDIR"
printf 'b\n' >> "$FIX_WORK/p/a.txt"
git -C "$FIX_WORK" add -A
git -C "$FIX_WORK" commit -m "feat(p): x" >/dev/null 2>&1 || die "bump commit failed"
printf 'c\n' >> "$FIX_WORK/p/a.txt"
git -C "$FIX_WORK" add -A
git -C "$FIX_WORK" commit --amend --no-edit >/dev/null || die "amend failed"
amend_json="$(git -C "$FIX_WORK" show HEAD:p/.claude-plugin/plugin.json)"
if printf '%s\n' "$amend_json" | grep -q '"version": "1.0.1"'; then
  ok "amended bump commit keeps version 1.0.1"
else
  bad "amended bump commit keeps version 1.0.1"
fi

# A content commit on a pushed plugin bumps the patch version inside that commit.
bump_obs="$(scenario_bump "$HOOKSDIR")" || die "bump scenario failed"
if printf '%s\n' "$bump_obs" | grep -q '^bump_line=1$'; then
  ok "content commit prints Auto-bumped p version: 1.0.0 -> 1.0.1"
else
  bad "content commit prints Auto-bumped p version: 1.0.0 -> 1.0.1"
fi
if printf '%s\n' "$bump_obs" | grep -q '^version=1.0.1$' && printf '%s\n' "$bump_obs" | grep -q '^wt_version=1.0.1$'; then
  ok "content commit stores version 1.0.1 in HEAD and the work tree"
else
  bad "content commit stores version 1.0.1 in HEAD and the work tree"
fi
if printf '%s\n' "$bump_obs" | grep -q '^porcelain_empty=1$'; then
  ok "content commit leaves a clean work tree"
else
  bad "content commit leaves a clean work tree"
fi

# A version the author already changed is left alone.
new_fixture "$HOOKSDIR"
printf 'b\n' >> "$FIX_WORK/p/a.txt"
cat > "$FIX_WORK/p/.claude-plugin/plugin.json" <<'EOF'
{
  "name": "p",
  "version": "1.1.0",
  "description": "d"
}
EOF
git -C "$FIX_WORK" add -A
manual_out="$(git -C "$FIX_WORK" commit -m "feat(p): x" 2>&1)" || die "manual bump commit failed: $manual_out"
manual_json="$(git -C "$FIX_WORK" show HEAD:p/.claude-plugin/plugin.json)"
if printf '%s\n' "$manual_json" | grep -q '"version": "1.1.0"'; then
  ok "hand-edited version 1.1.0 is what HEAD stores"
else
  bad "hand-edited version 1.1.0 is what HEAD stores"
fi
if printf '%s\n' "$manual_out" | grep -q 'Auto-bumped'; then
  bad "hand-edited version commit has no Auto-bumped line"
else
  ok "hand-edited version commit has no Auto-bumped line"
fi

# A brand-new plugin (no remote) and a manifest-only edit keep 1.0.0.
fresh="$(mktemp -d "$TMP/fresh.XXXXXX")"
git init -b main "$fresh" >/dev/null
git -C "$fresh" config user.email "dev@example.com"
git -C "$fresh" config user.name "Dev"
git -C "$fresh" config core.hooksPath "$HOOKSDIR"
mkdir -p "$fresh/p/.claude-plugin"
cat > "$fresh/p/.claude-plugin/plugin.json" <<'EOF'
{
  "name": "p",
  "version": "1.0.0",
  "description": "d"
}
EOF
printf 'a\n' > "$fresh/p/a.txt"
git -C "$fresh" add -A
fresh_out="$(git -C "$fresh" commit -m "feat(p): init" 2>&1)" || die "first plugin commit failed: $fresh_out"
fresh_json="$(git -C "$fresh" show HEAD:p/.claude-plugin/plugin.json)"
if printf '%s\n' "$fresh_json" | grep -q '"version": "1.0.0"' && ! printf '%s\n' "$fresh_out" | grep -q 'Auto-bumped'; then
  ok "first commit of a new plugin keeps 1.0.0 without Auto-bumped"
else
  bad "first commit of a new plugin keeps 1.0.0 without Auto-bumped"
fi

new_fixture "$HOOKSDIR"
cat > "$FIX_WORK/p/.claude-plugin/plugin.json" <<'EOF'
{
  "name": "p",
  "version": "1.0.0",
  "description": "e"
}
EOF
git -C "$FIX_WORK" add -A
desc_out="$(git -C "$FIX_WORK" commit -m "docs(p): describe" 2>&1)" || die "description commit failed: $desc_out"
desc_json="$(git -C "$FIX_WORK" show HEAD:p/.claude-plugin/plugin.json)"
if printf '%s\n' "$desc_json" | grep -q '"version": "1.0.0"' && ! printf '%s\n' "$desc_out" | grep -q 'Auto-bumped'; then
  ok "description-only edit keeps 1.0.0 without Auto-bumped"
else
  bad "description-only edit keeps 1.0.0 without Auto-bumped"
fi

# A push whose content change also carries a version change is accepted.
new_fixture "$HOOKSDIR"
printf 'b\n' >> "$FIX_WORK/p/a.txt"
git -C "$FIX_WORK" add -A
git -C "$FIX_WORK" commit -m "feat(p): x" >/dev/null 2>&1 || die "bump commit before push failed"
allow_err="$TMP/push-allow.err"
git -C "$FIX_WORK" push origin main >"$TMP/push-allow.out" 2>"$allow_err"
allow_ec=$?
if [ "$allow_ec" -eq 0 ]; then
  ok "push after the auto-bump exits 0"
else
  bad "push after the auto-bump exits 0"
fi
if grep -q '^pre-push:' "$allow_err"; then
  bad "push after the auto-bump has no pre-push: line"
else
  ok "push after the auto-bump has no pre-push: line"
fi
if [ "$(git -C "$FIX_BARE" rev-parse main)" = "$(git -C "$FIX_WORK" rev-parse HEAD)" ]; then
  ok "bare main matches work HEAD after the bumped push"
else
  bad "bare main matches work HEAD after the bumped push"
fi

# A push of plugin content without a version change is refused and the remote stays put.
refuse_obs="$(scenario_refuse "$HOOKSDIR")" || die "refuse scenario failed"
refuse_ec="$(printf '%s\n' "$refuse_obs" | sed -n 's/^exit=//p')"
if [ "$refuse_ec" -ne 0 ]; then
  ok "unbumped content push exits non-zero"
else
  bad "unbumped content push exits non-zero"
fi
if printf '%s\n' "$refuse_obs" | grep -q '^hook_line=1$'; then
  ok "unbumped content push stderr has the pre-push version line"
else
  bad "unbumped content push stderr has the pre-push version line"
fi
if printf '%s\n' "$refuse_obs" | grep -q '^remote_same=1$'; then
  ok "refused push leaves bare main on the pre-push SHA"
else
  bad "refused push leaves bare main on the pre-push SHA"
fi

# The same scenarios go red when the hooks do nothing.
noop="$TMP/noop-hooks"
mkdir -p "$noop"
printf '#!/bin/sh\nexit 0\n' > "$noop/pre-commit"
printf '#!/bin/sh\nexit 0\n' > "$noop/pre-push"
chmod +x "$noop/pre-commit" "$noop/pre-push"
mut_bump="$(scenario_bump "$noop")" || die "noop bump scenario failed"
mut_ver="$(printf '%s\n' "$mut_bump" | sed -n 's/^version=//p')"
if [ "$mut_ver" = "1.0.1" ]; then
  bad "guard cannot fail"
elif [ "$mut_ver" = "1.0.0" ]; then
  ok "no-op pre-commit leaves version 1.0.0"
else
  bad "no-op pre-commit leaves version 1.0.0"
fi
mut_refuse="$(scenario_refuse "$noop")" || die "noop refuse scenario failed"
mut_ec="$(printf '%s\n' "$mut_refuse" | sed -n 's/^exit=//p')"
if [ "$mut_ec" -ne 0 ]; then
  bad "guard cannot fail"
elif [ "$mut_ec" -eq 0 ]; then
  ok "no-op pre-push lets the unbumped push exit 0"
else
  bad "no-op pre-push lets the unbumped push exit 0"
fi

end_head="$(git -C "$ROOT" rev-parse HEAD)"
end_refs="$(git -C "$ROOT" for-each-ref)"
if [ "$end_head" = "$REAL_HEAD" ] && [ "$end_refs" = "$REAL_REFS" ]; then
  ok "real repo HEAD and for-each-ref are unchanged"
else
  bad "real repo HEAD and for-each-ref are unchanged"
fi

printf '%s\n' "--- version-hooks: $PASS passed, $FAIL failed"
if [ "$FAIL" -ne 0 ] || [ "$PASS" -eq 0 ]; then
  exit 1
fi
