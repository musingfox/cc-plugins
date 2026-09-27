#!/usr/bin/env bash
# Gate: every contract of ONE shard must have a test that goes red once the
# shard's own implementation is put back to BASE_HEAD. A test that stays green
# without the code it claims to cover proves nothing, and gate 3, scope and
# completeness all let it through.
#
# One control run on the untouched tree, then one run per contract (shards.json
# order). A contract's run reverts every own path except root build/lock
# manifests and that contract's own test files. A run that exits non-zero, or
# is killed at the deadline, went red.
#
# Usage:   cf-pi-revert-gate.sh SHARD_SESSION TEST_CMD [ARGS...]
# Stdout:  exactly one verdict line
#            CLEAN <n>                 exit 0  all n contracts went red
#            STAYS_GREEN <A>[,<B>...]  exit 2  these contracts' runs exited 0
#            ERROR <reason>            exit 1  no verdict
# Log:     SHARD_SESSION/revert-gate.log, one `### <run>` section per run.
#          Never $TEST_LOG: that is gate 3's evidence.
#
# TEST_CMD runs exactly as given, never the TEST_RUNNER env.sh defines.
# Env: CF_TEST_DEADLINE_S  seconds before a run is group-killed (default 1800)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

# Copied from cf-pi-scope.sh, the source: root build/lock manifests any shard
# may touch. A run needs them to install or build, so none is ever reverted.
BUILD_LOCK_ALLOWLIST='^(pyproject\.toml|uv\.lock|requirements[^/]*\.txt|package\.json|package-lock\.json|bun\.lock(b)?|yarn\.lock|pnpm-lock\.yaml|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?)$'

verdict() {
  printf '%s\n' "$1"
  exit "$2"
}

is_test_path() {
  case "/$1" in
    */test/*|*/tests/*|*/__tests__/*|*/spec/*) return 0 ;;
  esac
  case "${1##*/}" in
    *.test.*|*_test.*|test_*|*.spec.*|*_spec.*) return 0 ;;
  esac
  return 1
}

# Porcelain status of the own paths only, as a csv. Whole-tree status would read
# cf-pi-run.sh's intent-to-add entries and test artifacts as dirt.
own_status() {
  git -C "$WORK" -c core.quotePath=false --literal-pathspecs status --porcelain -- ${own[@]+"${own[@]}"} \
    | cut -c4- | sed 's/.* -> //' | sort -u | paste -sd, -
}

# put_back REV PATH...: each path to its state at REV, deleted when REV lacks it.
# Plumbing through a scratch index: `git checkout <rev> -- <path>` fires
# post-checkout, and the real index must keep what step 11 left in it.
put_back() {
  local rev="$1" idx="$SHARD_SESSION/revert-gate.index" p
  shift
  local present=()
  for p in "$@"; do
    if git -C "$WORK" cat-file -e "$rev:$p" 2>/dev/null; then
      present+=("$p")
    else
      rm -f "$WORK/$p"
    fi
  done
  [ ${#present[@]} -gt 0 ] || return 0
  rm -f "$idx"
  GIT_INDEX_FILE="$idx" git -C "$WORK" read-tree "$rev"
  GIT_INDEX_FILE="$idx" git -C "$WORK" checkout-index -f -- "${present[@]}"
  rm -f "$idx"
}

restore() { [ ${#own[@]} -eq 0 ] || put_back HEAD "${own[@]}"; }

run_suite() { # HEADER -> sets rc
  printf '### %s\n' "$1" >>"$LOG"
  rc=0
  ( cd "$WORK" && run_bounded "$DEADLINE" "${CMD[@]}" ) >>"$LOG" 2>&1 || rc=$?
  printf 'exit=%s\n' "$rc" >>"$LOG"
}

[ $# -ge 2 ] || verdict "ERROR usage" 1
SHARD_SESSION="$1"
shift
CMD=("$@")
LOG="$SHARD_SESSION/revert-gate.log"
DEADLINE="${CF_TEST_DEADLINE_S:-1800}"

load_cf_pi_env "$SHARD_SESSION" 2>/dev/null || verdict "ERROR session env.sh" 1
[ -n "${FLOW_SESSION:-}" ] && [ -n "${SHARD_ID:-}" ] && load_cf_flow_env "$FLOW_SESSION" 2>/dev/null \
  || verdict "ERROR session env.sh lacks FLOW_SESSION or SHARD_ID" 1
[ -f "$SHARDS_FILE" ] || verdict "ERROR session shards.json" 1
[ -f "$CONTRACTS_FILE" ] || verdict "ERROR session contracts.json" 1
jq -e --arg s "$SHARD_ID" '.groups[$s].contracts | type == "array"' "$SHARDS_FILE" >/dev/null 2>&1 \
  || verdict "ERROR session shard $SHARD_ID unknown" 1
contracts=()
while IFS= read -r name; do
  if [ -n "$name" ]; then contracts+=("$name"); fi
done <<<"$(jq -r --arg s "$SHARD_ID" '.groups[$s].contracts[]' "$SHARDS_FILE")"

# The set cf-pi-scope.sh charges: the commit union, prerequisite checkpoints excluded.
# shellcheck disable=SC2046
own_list=$(git -C "$WORK" -c core.quotePath=false log --name-only --pretty=format: "$BASE_HEAD..HEAD" \
  --not $(cat "$SHARD_SESSION/prereq-refs" 2>/dev/null) 2>/dev/null | sed '/^$/d' | sort -u || true)
own=()
while IFS= read -r p; do
  if [ -n "$p" ]; then own+=("$p"); fi
done <<<"$own_list"

# No own paths means an empty pathspec, which is the whole tree: skip the check.
dirty=""
[ ${#own[@]} -eq 0 ] || dirty=$(own_status)
[ -z "$dirty" ] || verdict "ERROR dirty-own-paths $dirty" 1

: >"$LOG"
run_suite control

green=""
for name in ${contracts[@]+"${contracts[@]}"}; do
  touches=$(jq -r --arg n "$name" '.contracts[] | select(.name == $n) | .touches_files[]?' "$CONTRACTS_FILE")
  revert=()
  for p in ${own[@]+"${own[@]}"}; do
    if printf '%s\n' "$p" | grep -Eq "$BUILD_LOCK_ALLOWLIST"; then continue; fi
    if is_test_path "$p" && printf '%s\n' "$touches" | grep -Fxq -- "$p"; then continue; fi
    revert+=("$p")
  done
  [ ${#revert[@]} -eq 0 ] || put_back "$BASE_HEAD" "${revert[@]}"
  run_suite "$name"
  restore || true
  [ "$rc" -ne 0 ] || green="${green:+$green,}$name"
done

[ -z "$green" ] || verdict "STAYS_GREEN $green" 2
verdict "CLEAN ${#contracts[@]}" 0
