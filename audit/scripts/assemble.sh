#!/usr/bin/env bash
# Assemble the tracers' reports into one list: counts, cf hand-off, sections, skipped.
set -euo pipefail

[ $# -ge 2 ] && [ -r "$1" ] || { echo "usage: assemble.sh <inventory-file> <reports-dir>" >&2; exit 1; }
inventory="$1"
reports="$2"

CLAUSE='^- \*\*(guarded|partly|unguarded|too loose|not test-guardable|retracted)\*\* L[0-9]+(-[0-9]+)? "[^"]*" — '

# Prints "<action>\t<status>\t<path>\t<slug>" per inventory line.
inventory_rows() {
  while IFS=$'\t' read -r action status path; do
    [ -n "$action" ] || continue
    slug="$(basename "$path" .md)"
    printf '%s\t%s\t%s\t%s\n' "$action" "$status" "$path" "$slug"
  done < "$inventory"
}

clause_lines() { grep -E "$CLAUSE" "$1" || true; }

echo '## Counts'
echo
echo '## Hand to cf'
echo

while IFS=$'\t' read -r action status path slug; do
  [ "$action" = trace ] || continue
  echo "## $slug ($status)"
  echo
  if [ ! -f "$reports/$slug.md" ]; then
    echo 'not traced: no report'
  elif [ -z "$(clause_lines "$reports/$slug.md")" ]; then
    echo 'not traced: no clause lines in report'
  else
    cat "$reports/$slug.md"
  fi
  echo
done < <(inventory_rows)

echo '## Skipped'
echo
while IFS=$'\t' read -r action status path slug; do
  [ "$action" = skip ] || continue
  echo "- $path — $status"
done < <(inventory_rows)
