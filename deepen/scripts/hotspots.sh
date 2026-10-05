#!/usr/bin/env bash
# Rank recent non-merge commits by depth-2 directory.
# Prints window / top-share / scope, then up to 5 ranked lines; the survey skill uses the first three.

set -euo pipefail

# 200 commits: the earlier window of 10 returned wide for repos with real churn (8ba6f0a).
n=200
while getopts 'n:' opt; do
  case "$opt" in
    n) n=$OPTARG ;;
    *) exit 1 ;;
  esac
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "[deepen] not a git repository: $PWD" >&2
  exit 1
fi

# An unborn branch is a valid zero-window answer; any other git log failure is an error.
if git rev-parse --verify --quiet HEAD >/dev/null; then
  log=$(git log -n "$n" --no-merges --name-only --pretty=format:'COMMIT')
else
  log=""
fi
window=$(printf '%s\n' "$log" | grep -c '^COMMIT$' || true)

ranked=$(
  printf '%s\n' "$log" | awk '
    $0 == "COMMIT" { delete seen; next }
    NF == 0 { next }
    {
      n = split($0, a, "/")
      if (n == 1) b = "."
      else if (n == 2) b = a[1]
      else b = a[1] "/" a[2]
      if (!(b in seen)) { seen[b] = 1; print b }
    }
  ' | sort | uniq -c | sort -k1,1nr -k2,2 | awk '{ print $1, $2 }' | head -n 5
)

top=0
if [ -n "$ranked" ]; then
  top=$(printf '%s\n' "$ranked" | awk 'NR==1 { print $1 }')
fi

share=0
if [ "$window" -gt 0 ]; then
  share=$((100 * top / window))
fi

# Hotspot needs a window of at least 10 commits (below that the history is too thin to rank)
# and a top directory in at least 25% of them (the earlier 50% bar returned wide too often, 8ba6f0a).
if [ "$window" -ge 10 ] && [ "$share" -ge 25 ]; then
  scope=hotspot
else
  scope=wide
fi

printf 'window: %s\n' "$window"
printf 'top-share: %s\n' "$share"
printf 'scope: %s\n' "$scope"
if [ -n "$ranked" ]; then
  printf '%s\n' "$ranked"
fi
