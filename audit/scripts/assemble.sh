#!/usr/bin/env bash
# Assemble the tracers' reports into one list: counts, cf hand-off, sections, skipped.
set -euo pipefail

[ $# -ge 2 ] && [ -r "$1" ] || { echo "usage: assemble.sh <inventory-file> <reports-dir>" >&2; exit 1; }
inventory="$1"
reports="$2"

# One verdict list, in the order of the Counts columns; the patterns below derive from it.
verdicts=(guarded partly unguarded "too loose" contradicted "not test-guardable" retracted)
alt="$(printf '%s|' "${verdicts[@]}")"
SHAPE='L[0-9]+(-[0-9]+)? "[^"]*"'
CLAUSE='^- \*\*('"${alt%|}"')\*\* '"$SHAPE"' — '

# Prints "<action>\t<status>\t<path>\t<slug>" per inventory line.
inventory_rows() {
  while IFS=$'\t' read -r action status path; do
    [ -n "$action" ] || continue
    slug="$(basename "$path" .md)"
    printf '%s\t%s\t%s\t%s\n' "$action" "$status" "$path" "$slug"
  done < "$inventory"
}

clause_lines() { grep -E "$CLAUSE" "$1" || true; }

counts_block() {
  local -a total=()
  local untraced=() malformed=() action status path slug report i n row header=
  local bad=0
  for i in "${!verdicts[@]}"; do total+=(0); header="$header ${verdicts[$i]} |"; done
  echo '## Counts'
  echo
  echo "| milestone |$header"
  printf '|---%.0s' "${verdicts[@]}" '' ; echo '|'
  while IFS=$'\t' read -r action status path slug; do
    [ "$action" = trace ] || continue
    report="$reports/$slug.md"
    if [ -f "$report" ]; then
      n="$({ grep -E '^- \*\*' "$report" || true; } | { grep -Evc "$CLAUSE" || true; })"
      if [ "$n" -gt 0 ]; then bad=$((bad + n)); malformed+=("$slug"); fi
    fi
    if [ ! -f "$report" ] || [ -z "$(clause_lines "$report")" ]; then
      untraced+=("$slug")
      continue
    fi
    row="| $slug"
    for i in "${!verdicts[@]}"; do
      n="$(clause_lines "$report" | grep -cF -- "- **${verdicts[$i]}** L" || true)"
      total[$i]=$((total[$i] + n))
      row="$row | $n"
    done
    echo "$row |"
  done < <(inventory_rows)
  row="| total"
  for i in "${!verdicts[@]}"; do row="$row | ${total[$i]}"; done
  echo "$row |"
  if [ ${#untraced[@]} -gt 0 ]; then
    echo
    echo "not traced: $(printf '%s, ' "${untraced[@]}" | sed 's/, $//')"
  fi
  if [ "$bad" -gt 0 ]; then
    echo
    echo "malformed lines: $bad ($(printf '%s, ' "${malformed[@]}" | sed 's/, $//'))"
  fi
  echo
}

handoff_block() {
  local action status path slug report clauses n=0
  echo '## Hand to cf'
  echo
  while IFS=$'\t' read -r action status path slug; do
    [ "$action" = trace ] && [ "$status" = done ] || continue
    report="$reports/$slug.md"
    [ -f "$report" ] || continue
    clauses="$(clause_lines "$report" | { grep -E '^- \*\*(partly|unguarded)\*\* ' || true; } \
      | sed -E 's/^- \*\*[a-z -]+\*\* ('"$SHAPE"') — .*$/\1/' | awk 'NR>1{printf "; "} {printf "%s", $0}')"
    [ -n "$clauses" ] || continue
    echo "/cf Add tests that guard these commitments of $path: $clauses"
    n=$((n + 1))
  done < <(inventory_rows)
  [ "$n" -gt 0 ] || echo 'nothing to hand to cf'
  echo
}

counts_block
handoff_block
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
    awk '/^```/{f=!f; print; next} !f && /^#/{print "##" $0; next} {print}' "$reports/$slug.md"
  fi
  echo
done < <(inventory_rows)

echo '## Skipped'
echo
while IFS=$'\t' read -r action status path slug; do
  [ "$action" = skip ] || continue
  echo "- $path — $status"
done < <(inventory_rows)
