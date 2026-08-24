#!/usr/bin/env bash
# Architecture spec library — the mechanical half. Judgement lives in the skill.
#
#   spec.sh verify              run every accepted entry's `verify:` line
#   spec.sh slice <path>...     print the body of every accepted entry whose
#                               scope matches one of the paths
#
# Both run from the repo root. SPEC_DIR overrides the default docs/spec.
set -u

root=$(git rev-parse --show-toplevel 2>/dev/null) && cd "$root"
SPEC_DIR=${SPEC_DIR:-docs/spec}

field() { sed -n "s/^$2: *//p" "$1" | head -1; }

scopes() {
  awk '/^scope:/{s=1;next} /^[^ -]/{s=0} s && /^ *- /{sub(/^ *- */,"");gsub(/"/,"");print}' "$1"
}

body() {
  awk 'BEGIN{d=0} d<2 && /^---$/{d++;next} d>=2' "$1"
}

entries() { ls "$SPEC_DIR"/*.md 2>/dev/null; }

require_dir() {
  [ -d "$SPEC_DIR" ] || { echo "no spec library at $SPEC_DIR (set SPEC_DIR or create it)" >&2; exit 2; }
}

cmd_verify() {
  local red=0 debt=0 f id status verify
  for f in $(entries); do
    id=$(field "$f" id); status=$(field "$f" status); verify=$(field "$f" verify)
    if [ "$status" != accepted ]; then
      echo "SKIP  $id ($status)"
    elif [ "${verify%%:*}" = check ]; then
      # ponytail: only `check:` is executable; add a `test:` branch when an entry needs one.
      if bash -c "${verify#check:}" >/dev/null 2>&1; then
        echo "PASS  $id"
      else
        echo "FAIL  $id -- ${verify#check:}"; red=1
      fi
    else
      echo "DEBT  $id -- prose only, drifts silently"; debt=$((debt + 1))
    fi
  done
  [ "$debt" -eq 0 ] || echo "-- $debt entry(ies) rely on prose only"
  return $red
}

cmd_slice() {
  local f id p g
  for f in $(entries); do
    [ "$(field "$f" status)" = accepted ] || continue
    id=$(field "$f" id)
    for p in "$@"; do
      for g in $(scopes "$f"); do
        # shellcheck disable=SC2053
        if [[ $p == $g ]]; then
          echo "## spec: $id"
          echo
          body "$f"
          continue 3
        fi
      done
    done
  done
}

case "${1:-}" in
  verify) shift; require_dir; cmd_verify ;;
  slice)  shift; require_dir; [ $# -gt 0 ] || { echo "slice needs at least one path" >&2; exit 2; }; cmd_slice "$@" ;;
  *) sed -n '2,9s/^# \{0,1\}//p' "$0" >&2; exit 2 ;;
esac
