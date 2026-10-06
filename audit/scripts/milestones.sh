#!/usr/bin/env bash
# List the milestone files of a repo and say which to trace.
set -euo pipefail

usage() { echo "usage: milestones.sh <repo>" >&2; exit 1; }
[ $# -ge 1 ] && [ -d "$1" ] || usage
repo="$1"
dir="$repo/docs/milestones"
[ -d "$dir" ] || { echo "no docs/milestones/ in $repo: nothing to trace" >&2; exit 2; }

# Prints "no-frontmatter" without frontmatter, else "fm:<raw status value>" ("fm:" when no key).
status_of() {
  awk '
    NR == 1 { if ($0 != "---") { print "no-frontmatter"; found = 1; exit } ; next }
    /^---$/ { print "fm:" s; found = 1; exit }
    /^status:/ && !seen { seen = 1; s = substr($0, 8) }
    END { if (!found) print "no-frontmatter" }
  ' "$1"
}

normalise() {
  printf '%s' "$1" | sed -E 's/#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/; s/^[[:space:]]+//; s/[[:space:]]+$//' | tr '[:upper:]' '[:lower:]'
}

shopt -s nullglob
names=()
for f in "$dir"/*.md; do
  [ -f "$f" ] && names+=("$(basename "$f")")
done
[ ${#names[@]} -gt 0 ] || exit 0

while IFS= read -r name; do
  raw="$(status_of "$dir/$name")"
  rel="docs/milestones/$name"
  if [ "$raw" = no-frontmatter ]; then
    printf 'skip\tno-frontmatter\t%s\n' "$rel"
    continue
  fi
  st="$(normalise "${raw#fm:}")"
  [ -n "$st" ] || st=unset
  case "$st" in
    superseded|abandoned) printf 'skip\t%s\t%s\n' "$st" "$rel" ;;
    *) printf 'trace\t%s\t%s\n' "$st" "$rel" ;;
  esac
done < <(printf '%s\n' "${names[@]}" | LC_ALL=C sort)
