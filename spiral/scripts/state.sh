#!/usr/bin/env bash
# Spiral state — the ONLY read/write path for .spiral/state.json.
#
# The multi-turn rise (accepted holes → next-turn gate checks) rests on this file
# keeping its shape across turns; the orchestrator hand-editing JSON is the failure
# mode this script removes. Every mutation validates the full schema and writes
# atomically (tmp + mv) — a malformed result never lands.
#
# Schema (exactly these keys):
#   goal           string   the frozen goal for the run
#   seed           string   the current turn's seed
#   turn           int >=1
#   examples       array    frozen Examples for the current turn
#   gate_path      string   .spiral/gate-turn-N.sh ("" before EXAMINE)
#   accepted_holes array    parked holes — required gate checks in later turns
#   feedback_log   array    one entry per turn outcome
#
# Usage:
#   state.sh init <goal>             create fresh state (turn 1, seed = goal); fails if present
#   state.sh get [jq-filter]         print state (optionally filtered); fails if absent
#   state.sh set <key> <value>       goal|seed|gate_path take a raw string;
#                                    examples|accepted_holes take a JSON array
#   state.sh append <key> <value>    accepted_holes|feedback_log; JSON value or raw string
#   state.sh next-turn <seed>        turn+1, new seed; resets examples + gate_path
#   state.sh validate                check the schema of the existing file
set -eu

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
STATE="$PROJECT_DIR/.spiral/state.json"

VALID='type == "object"
  and (keys | sort) == ["accepted_holes","examples","feedback_log","gate_path","goal","seed","turn"]
  and (.goal | type) == "string"
  and (.seed | type) == "string"
  and (.gate_path | type) == "string"
  and (.turn | (type == "number" and . == floor and . >= 1))
  and (.examples | type) == "array"
  and (.accepted_holes | type) == "array"
  and (.feedback_log | type) == "array"'

die() { echo "state.sh: $*" >&2; exit 1; }

require_state() { [ -f "$STATE" ] || die "no state at $STATE — run: state.sh init <goal>"; }

validate_file() {
  jq -e "$VALID" "$1" >/dev/null 2>&1 || die "schema violation — refused to write: $(jq -c . "$1" 2>/dev/null || echo 'not even JSON')"
}

# mutate <jq-program> [jq args...] — apply to STATE, validate, atomic replace.
mutate() {
  local prog="$1"; shift
  local tmp
  tmp=$(mktemp "$STATE.XXXXXX")
  jq "$@" "$prog" "$STATE" > "$tmp" || { rm -f "$tmp"; die "jq failed"; }
  validate_file "$tmp"
  mv "$tmp" "$STATE"
}

cmd="${1:-}"; shift || true
case "$cmd" in
  init)
    [ $# -eq 1 ] || die "usage: state.sh init <goal>"
    [ ! -f "$STATE" ] || die "state already exists at $STATE — refuse to clobber"
    mkdir -p "$(dirname "$STATE")"
    tmp=$(mktemp "$STATE.XXXXXX")
    jq -n --arg goal "$1" '{goal: $goal, seed: $goal, turn: 1, examples: [],
      gate_path: "", accepted_holes: [], feedback_log: []}' > "$tmp"
    validate_file "$tmp"
    mv "$tmp" "$STATE"
    ;;
  get)
    require_state
    jq "${1:-.}" "$STATE"
    ;;
  set)
    [ $# -eq 2 ] || die "usage: state.sh set <key> <value>"
    require_state
    case "$1" in
      goal|seed|gate_path)
        mutate '.[$k] = $v' --arg k "$1" --arg v "$2" ;;
      examples|accepted_holes)
        printf '%s' "$2" | jq -e 'type == "array"' >/dev/null 2>&1 \
          || die "set $1 takes a JSON array"
        mutate '.[$k] = $v' --arg k "$1" --argjson v "$2" ;;
      *) die "set: key must be goal|seed|gate_path|examples|accepted_holes (turn moves only via next-turn)" ;;
    esac
    ;;
  append)
    [ $# -eq 2 ] || die "usage: state.sh append <key> <value>"
    require_state
    case "$1" in accepted_holes|feedback_log) : ;; *) die "append: key must be accepted_holes|feedback_log" ;; esac
    if printf '%s' "$2" | jq -e . >/dev/null 2>&1; then
      mutate '.[$k] += [$v]' --arg k "$1" --argjson v "$2"
    else
      mutate '.[$k] += [$v]' --arg k "$1" --arg v "$2"
    fi
    ;;
  next-turn)
    [ $# -eq 1 ] || die "usage: state.sh next-turn <seed>"
    require_state
    mutate '.turn += 1 | .seed = $v | .examples = [] | .gate_path = ""' --arg v "$1"
    ;;
  validate)
    require_state
    validate_file "$STATE"
    echo "ok"
    ;;
  *)
    die "usage: state.sh init|get|set|append|next-turn|validate (see header)"
    ;;
esac
