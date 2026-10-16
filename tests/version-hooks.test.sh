#!/usr/bin/env bash
# Self-checks for .githooks/pre-commit and pre-push. The hooks themselves are not modified.
set -uo pipefail

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

checks=0
TMP="$(mktemp -d)"
fx=0

die() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
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
  rm -rf "$TMP"
  exit "$rc"
}
trap on_exit EXIT

ok() {
  checks=$((checks + 1))
}

# new_fixture <hooks-dir>
# Sets FIX_WORK and FIX_BARE: bare origin plus a main work tree with plugin p at 1.0.0, pushed.
new_fixture() {
  local hooks="$1"
  fx=$((fx + 1))
  FIX_BARE="$TMP/f${fx}.git"
  FIX_WORK="$TMP/f${fx}"
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

new_fixture "$HOOKSDIR"
got="$(git -C "$FIX_WORK" config --get core.hooksPath)"
[ "$got" = "$HOOKSDIR" ] || die "core.hooksPath is '$got', want '$HOOKSDIR'"
ok

[ -f "$HOOKSDIR/pre-commit" ] && [ -f "$HOOKSDIR/pre-push" ] || die "repo .githooks is missing pre-commit or pre-push"
ok

global="$(git config --global --list 2>/dev/null || true)"
[ -z "$global" ] || die "git config --global --list was not empty"
ok

# A second content commit before any push must not bump again, and amending the
# bump commit with more staged content must keep 1.0.1.
new_fixture "$HOOKSDIR"
printf 'b\n' >> "$FIX_WORK/p/a.txt"
git -C "$FIX_WORK" add -A
git -C "$FIX_WORK" commit -m "feat(p): x" >/dev/null || die "first content commit failed"
printf 'c\n' >> "$FIX_WORK/p/a.txt"
git -C "$FIX_WORK" add -A
second_out="$(git -C "$FIX_WORK" commit -m "feat(p): y" 2>&1)" || die "second content commit failed: $second_out"
if printf '%s\n' "$second_out" | grep -q 'Auto-bumped'; then
  die "second unpushed content commit printed Auto-bumped"
fi
ok
second_json="$(git -C "$FIX_WORK" show HEAD:p/.claude-plugin/plugin.json)"
printf '%s\n' "$second_json" | grep -q '"version": "1.0.1"' || die "second commit version is not 1.0.1"
ok

new_fixture "$HOOKSDIR"
printf 'b\n' >> "$FIX_WORK/p/a.txt"
git -C "$FIX_WORK" add -A
git -C "$FIX_WORK" commit -m "feat(p): x" >/dev/null || die "bump commit failed"
printf 'c\n' >> "$FIX_WORK/p/a.txt"
git -C "$FIX_WORK" add -A
git -C "$FIX_WORK" commit --amend --no-edit >/dev/null || die "amend failed"
amend_json="$(git -C "$FIX_WORK" show HEAD:p/.claude-plugin/plugin.json)"
printf '%s\n' "$amend_json" | grep -q '"version": "1.0.1"' || die "amended bump commit version is not 1.0.1"
ok

end_head="$(git -C "$ROOT" rev-parse HEAD)"
end_refs="$(git -C "$ROOT" for-each-ref)"
[ "$end_head" = "$REAL_HEAD" ] || die "real repo HEAD changed"
[ "$end_refs" = "$REAL_REFS" ] || die "real repo for-each-ref changed"
ok
