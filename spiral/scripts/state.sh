#!/usr/bin/env bash
# Spiral state — the ONLY read/write path for .spiral/state.json.
#
# The multi-turn rise (accepted holes → next-turn gate checks) rests on this file
# keeping its shape across turns; the orchestrator hand-editing JSON is the failure
# mode this script removes. Every mutation validates the schema and writes
# atomically (tmp + mv) — a malformed result never lands.
#
# Schema: OPEN with a typed core. Real runs (cc-mobile ADR-011, 15 turns) grow
# free-form keys per turn (verdicts, holes, milestones, honest notes) — that is the
# orchestrator's cross-turn memory and must not be fought. What hand-editing broke
# in practice was the CORE drifting (gate_path fossilized at turn 2 while gates
# reached turn 15), so the core keys are required and typed; everything else is free.
#   goal           string   the frozen goal for the run        (required)
#   seed           string   the current turn's seed            (required)
#   turn           int >=1                                     (required, moves only via next-turn)
#   examples       array    frozen Examples for the current turn (required)
#   gate_path      string   .spiral/gate-turn-N.sh ("" before EXAMINE) (required)
#   accepted_holes array    parked holes — required gate checks later (required)
#   feedback_log   array    one entry per turn outcome         (required)
#   <anything else>         free-form — JSON value or string
#
# Usage:
#   state.sh init <goal>             create fresh state (turn 1, seed = goal); fails if present
#   state.sh get [jq-filter]         print state (optionally filtered); fails if absent
#   state.sh set <key> <value>       any key except turn; value parsed as JSON, else stored as string
#   state.sh append <key> <value>    append to an array key (created if absent); JSON value or string
#   state.sh next-turn <seed>        turn+1, new seed; resets examples + gate_path
#   state.sh validate                check the schema of the existing file
set -eu

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
STATE="$PROJECT_DIR/.spiral/state.json"

# Legacy states (hand-written, pre-state.sh) may lack core keys — every mutation
# fills the missing ones with defaults first (self-heal), then type-checks.
DEFAULTS='{goal: "", seed: "", turn: 1, examples: [], gate_path: "", accepted_holes: [], feedback_log: []}'

VALID='type == "object"
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
  jq -e "$VALID" "$1" >/dev/null 2>&1 \
    || die "core schema violation (goal/seed/gate_path strings, turn int>=1, examples/accepted_holes/feedback_log arrays) — refused to write"
}

# mutate <jq-program> [jq args...] — normalize core defaults, apply to STATE,
# validate, atomic replace.
mutate() {
  local prog="$1"; shift
  local tmp
  tmp=$(mktemp "$STATE.XXXXXX")
  jq "$@" "$DEFAULTS + . | ($prog)" "$STATE" > "$tmp" || { rm -f "$tmp"; die "jq failed"; }
  validate_file "$tmp"
  mv "$tmp" "$STATE"
}

# as_json_args <value> — echo jq arg flags: --argjson if value parses as JSON, else --arg.
value_flag() {
  if printf '%s' "$1" | jq -e . >/dev/null 2>&1; then echo --argjson; else echo --arg; fi
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
    [ "$1" != "turn" ] || die "turn moves only via next-turn"
    mutate '.[$k] = $v' --arg k "$1" "$(value_flag "$2")" v "$2"
    ;;
  append)
    [ $# -eq 2 ] || die "usage: state.sh append <key> <value>"
    require_state
    jq -e --arg k "$1" '(.[$k] // []) | type == "array"' "$STATE" >/dev/null 2>&1 \
      || die "append: .$1 exists and is not an array"
    mutate '.[$k] = ((.[$k] // []) + [$v])' --arg k "$1" "$(value_flag "$2")" v "$2"
    ;;
  next-turn)
    [ $# -eq 1 ] || die "usage: state.sh next-turn <seed>"
    require_state
    mutate '.turn += 1 | .seed = $v | .examples = [] | .gate_path = ""' --arg v "$1"
    ;;
  validate)
    require_state
    # Check the normalized form: a legacy state missing core keys is fine (the
    # next mutation self-heals it); only wrong-typed cores are a violation.
    jq -e "$DEFAULTS + . | ($VALID)" "$STATE" >/dev/null 2>&1 \
      || die "core schema violation (goal/seed/gate_path strings, turn int>=1, examples/accepted_holes/feedback_log arrays)"
    echo "ok"
    ;;
  *)
    die "usage: state.sh init|get|set|append|next-turn|validate (see header)"
    ;;
esac
