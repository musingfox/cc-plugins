#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

S="$PWD/audit/scripts/test-files.sh"
root="$PWD"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

gitq() { env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE git "$@"; }

r="$tmp/r"
mkdir -p "$r"
gitq -C "$r" init -q
printf 'node_modules/\n' > "$r/.gitignore"
for f in a/tests/x.test.sh a/tests/run.sh a/tests/fixtures/pane.ts b/check.bats docs/notes-test.md \
  go/pkg/foo_test.go m/tests/register.test.ts pi/tests/writable-test.sh py/tests/conftest.py \
  py/tests/test_digest.py web/client/__tests__/App.tsx web/src/app.spec.js; do
  mkdir -p "$r/$(dirname "$f")"; : > "$r/$f"
done
gitq -C "$r" add -A
gitq -C "$r" -c user.name=t -c user.email=t@t commit -q -m "chore: fixture"
mkdir -p "$r/new/tests" "$r/node_modules/pkg"
: > "$r/new/tests/y.test.sh"; : > "$r/node_modules/pkg/z.test.js"

want='a/tests/x.test.sh
b/check.bats
go/pkg/foo_test.go
m/tests/register.test.ts
new/tests/y.test.sh
pi/tests/writable-test.sh
py/tests/test_digest.py
web/client/__tests__/App.tsx
web/src/app.spec.js'

got="$(bash "$S" "$r")" || fail "T1 exit"
[ "$got" = "$want" ] || fail "T1 list: got
$got"

got="$(cd "$root" && GIT_DIR="$(git rev-parse --absolute-git-dir)" bash "$S" "$r")" || fail "T2 exit"
[ "$got" = "$want" ] || fail "T2 list under GIT_DIR: got
$got"

mkdir "$tmp/plain"
rc=0; err="$(bash "$S" "$tmp/plain" 2>&1 >/dev/null)" || rc=$?
[ "$rc" = 1 ] || fail "T3 exit 1, got $rc"
[ "$err" = "not a git repository: $tmp/plain" ] || fail "T3 stderr: $err"

rc=0; err="$(bash "$S" 2>&1 >/dev/null)" || rc=$?
[ "$rc" = 1 ] && [ "$err" = "usage: test-files.sh <repo>" ] || fail "usage error: $rc $err"

mkdir "$tmp/empty"; gitq -C "$tmp/empty" init -q; : > "$tmp/empty/README.md"
out="$(bash "$S" "$tmp/empty")" || fail "T4 exit 0"
[ -z "$out" ] || fail "T4 empty stdout"

bare="$tmp/b.git"
gitq init -q --bare "$bare"
rc=0; err="$(bash "$S" "$bare" 2>&1 >/dev/null)" || rc=$?
[ "$rc" = 1 ] && [ "$err" = "not a git repository: $bare" ] || fail "T5 bare repo: $rc $err"

rc=0; err="$(bash "$S" "$r/.git" 2>&1 >/dev/null)" || rc=$?
[ "$rc" = 1 ] && [ "$err" = "not a git repository: $r/.git" ] || fail "T6 .git dir: $rc $err"

q="$tmp/q"
mkdir -p "$q/tests"
gitq -C "$q" init -q
: > "$q/tests/中文.test.sh"; : > "$q/tests/a\"b.test.sh"
got="$(GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 bash "$S" "$q")" || fail "T7 exit"
[ "$got" = "tests/a\"b.test.sh
tests/中文.test.sh" ] || fail "T7 default quotePath: got
$got"
