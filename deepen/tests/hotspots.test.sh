#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

script="$PWD/deepen/scripts/hotspots.sh"

init_git() {
  local d="$1"
  git -C "$d" init -q
  git -C "$d" config user.email t@t.test
  git -C "$d" config user.name t
  git -C "$d" config commit.gpgsign false
  git -C "$d" config core.hooksPath /dev/null
}

commit_file() {
  local d="$1" path="$2"
  mkdir -p "$d/$(dirname "$path")"
  printf 'x\n' >> "$d/$path"
  git -C "$d" add -- "$path"
  git -C "$d" commit -q -m "$path"
}

run() {
  local d="$1"
  shift
  bash "$script" "$@"
}

# T1: 6 orders + 4 other dirs in a 10-commit window -> hotspot
t1="$(mktemp -d)"
init_git "$t1"
i=0
while [ "$i" -lt 6 ]; do
  commit_file "$t1" "src/orders/${i}.txt"
  i=$((i + 1))
done
commit_file "$t1" src/billing/a.txt
commit_file "$t1" docs/b.md
commit_file "$t1" lib/c.txt
commit_file "$t1" README.md
out="$(cd "$t1" && run "$t1")"
printf '%s\n' "$out" | grep -qx 'window: 10' || fail "T1: expected window: 10"
printf '%s\n' "$out" | grep -qx 'top-share: 60' || fail "T1: expected top-share: 60"
printf '%s\n' "$out" | grep -qx 'scope: hotspot' || fail "T1: expected scope: hotspot"
first_ranked="$(printf '%s\n' "$out" | grep -E '^[0-9]+ ' | head -n 1)"
[ "$first_ranked" = '6 src/orders' ] || fail "T1: first ranked line must be '6 src/orders', got '$first_ranked'"
printf '%s\n' "$out" | grep -qx '1 .' || fail "T1: expected ranked line '1 .'"
rm -rf "$t1"

# T2: 12 distinct depth-2 dirs, none dominates
t2="$(mktemp -d)"
init_git "$t2"
i=0
while [ "$i" -lt 12 ]; do
  commit_file "$t2" "src/d$(printf '%02d' "$i")/f.txt"
  i=$((i + 1))
done
out="$(cd "$t2" && run "$t2" -n 12)"
printf '%s\n' "$out" | grep -qx 'top-share: 8' || fail "T2: expected top-share: 8"
printf '%s\n' "$out" | grep -qx 'scope: wide' || fail "T2: expected scope: wide"
ranked_n="$(printf '%s\n' "$out" | grep -cE '^[0-9]+ ' || true)"
[ "$ranked_n" -eq 5 ] || fail "T2: expected exactly 5 ranked lines, got $ranked_n"
rm -rf "$t2"

# T3: all five commits in one dir, small window -> wide
t3="$(mktemp -d)"
init_git "$t3"
i=0
while [ "$i" -lt 5 ]; do
  commit_file "$t3" src/orders/a.txt
  i=$((i + 1))
done
out="$(cd "$t3" && run "$t3")"
printf '%s\n' "$out" | grep -qx 'window: 5' || fail "T3: expected window: 5"
printf '%s\n' "$out" | grep -qx 'top-share: 100' || fail "T3: expected top-share: 100"
printf '%s\n' "$out" | grep -qx 'scope: wide' || fail "T3: expected scope: wide"
rm -rf "$t3"

# T4: merge commit dropped; branch commit kept
t4="$(mktemp -d)"
init_git "$t4"
i=0
while [ "$i" -lt 9 ]; do
  commit_file "$t4" "src/p${i}/f.txt"
  i=$((i + 1))
done
git -C "$t4" checkout -q -b topic
commit_file "$t4" src/orders/m.txt
git -C "$t4" checkout -q -
git -C "$t4" merge --no-ff -q -m merge topic
log_n="$(git -C "$t4" log --oneline | wc -l | tr -d ' ')"
[ "$log_n" -eq 11 ] || fail "T4: fixture must have 11 log entries, got $log_n"
out="$(cd "$t4" && run "$t4" -n 20)"
printf '%s\n' "$out" | grep -qx 'window: 10' || fail "T4: expected window: 10"
rm -rf "$t4"

# T5: -n 3 on a T1-shaped fixture
t5="$(mktemp -d)"
init_git "$t5"
i=0
while [ "$i" -lt 6 ]; do
  commit_file "$t5" "src/orders/${i}.txt"
  i=$((i + 1))
done
commit_file "$t5" src/billing/a.txt
commit_file "$t5" docs/b.md
commit_file "$t5" lib/c.txt
commit_file "$t5" README.md
out="$(cd "$t5" && run "$t5" -n 3)"
printf '%s\n' "$out" | grep -qx 'window: 3' || fail "T5: expected window: 3"
rm -rf "$t5"

# T6: not a git repository
t6="$(mktemp -d)"
set +e
err="$(cd "$t6" && bash "$script" 2>&1 >/dev/null)"
rc=$?
set -e
[ "$rc" -eq 1 ] || fail "T6: expected exit 1, got $rc"
want="[deepen] not a git repository: $(cd "$t6" && pwd)"
[ "$err" = "$want" ] || fail "T6: stderr must be exactly '$want', got '$err'"
rm -rf "$t6"

# T7: depth-3 path buckets at depth 2
t7="$(mktemp -d)"
init_git "$t7"
commit_file "$t7" src/orders/deep/x.txt
out="$(cd "$t7" && run "$t7")"
printf '%s\n' "$out" | grep -qx '1 src/orders' || fail "T7: expected ranked line '1 src/orders'"
if printf '%s\n' "$out" | grep -q 'src/orders/deep'; then fail "T7: must not rank src/orders/deep"; fi
rm -rf "$t7"

# T8: default window is 200, threshold is 25 — 20 commits, 6 in src/orders -> hotspot
t8="$(mktemp -d)"
init_git "$t8"
i=0
while [ "$i" -lt 6 ]; do
  commit_file "$t8" "src/orders/${i}.txt"
  i=$((i + 1))
done
i=0
while [ "$i" -lt 14 ]; do
  commit_file "$t8" "src/d$(printf '%02d' "$i")/f.txt"
  i=$((i + 1))
done
out="$(cd "$t8" && run "$t8")"
printf '%s\n' "$out" | grep -qx 'window: 20' || fail "T8: default window must cover all 20 commits"
printf '%s\n' "$out" | grep -qx 'top-share: 30' || fail "T8: expected top-share: 30"
printf '%s\n' "$out" | grep -qx 'scope: hotspot' || fail "T8: top-share 30 must be a hotspot"
first_ranked="$(printf '%s\n' "$out" | grep -E '^[0-9]+ ' | head -n 1)"
[ "$first_ranked" = '6 src/orders' ] || fail "T8: first ranked line must be '6 src/orders', got '$first_ranked'"
rm -rf "$t8"

# T9: empty repository (unborn branch) -> zero window, wide, exit 0
t9="$(mktemp -d)"
init_git "$t9"
set +e
out="$(cd "$t9" && bash "$script" 2>"$t9.err")"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "T9: expected exit 0, got $rc ($(cat "$t9.err"))"
printf '%s\n' "$out" | grep -qx 'window: 0' || fail "T9: expected window: 0"
printf '%s\n' "$out" | grep -qx 'top-share: 0' || fail "T9: expected top-share: 0"
printf '%s\n' "$out" | grep -qx 'scope: wide' || fail "T9: expected scope: wide"
ranked_n="$(printf '%s\n' "$out" | grep -cE '^[0-9]+ ' || true)"
[ "$ranked_n" -eq 0 ] || fail "T9: expected no ranked lines, got $ranked_n"
rm -rf "$t9" "$t9.err"
