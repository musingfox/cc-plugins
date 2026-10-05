#!/usr/bin/env bash
# Gate: every contract of ONE shard must have a test that goes red once the
# shard's own implementation is put back to BASE_HEAD. A test that stays green
# without the code it claims to cover proves nothing, and gate 3, scope and
# completeness all let it through.
#
# One control run on the untouched tree, then one run per contract (shards.json
# order). A contract's run reverts every own path except root build/lock
# manifests and that contract's own test files: its `test_files` in
# contracts.json, or without the field, its touched paths that look like tests.
# A run that exits non-zero, or is killed at the deadline, went red.
#
# Usage:   cf-pi-revert-gate.sh SHARD_SESSION TEST_CMD [ARGS...]
# Stdout:  exactly one verdict line
#            CLEAN <n>                 exit 0  all n contracts went red
#            STAYS_GREEN <A>[,<B>...]  exit 2  these contracts' runs exited 0
#            SKIPPED no-git            exit 0  REPO_ROOT is empty; TEST_CMD never runs
#            ERROR <reason>            exit 1  no verdict
# Log:     SHARD_SESSION/revert-gate.log, one `### <run>` section per run.
#          Never $TEST_LOG: that is gate 3's evidence.
#
# TEST_CMD runs exactly as given, never the TEST_RUNNER env.sh defines.
# cf-pi-run.sh passes it as `bash -c "$TEST_RUNNER"`.
# Env: CF_TEST_DEADLINE_S  seconds before a run is group-killed (default 1800)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

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
  git -C "$WORK" --literal-pathspecs status --porcelain -z --no-renames -- ${own[@]+"${own[@]}"} \
    | while IFS= read -r -d '' rec; do printf '%s\n' "${rec:3}"; done | sort -u | paste -sd, -
}

# put_back REV PATH...: each path to its state at REV, deleted when REV lacks it.
# Plumbing through a scratch index: `git checkout <rev> -- <path>` fires
# post-checkout, and the real index must keep what step 11 left in it.
# Only a blob or gitlink at REV is written. A tree at REV means the path was a
# directory there, and its files are in the list themselves, so whatever file
# stands in its place goes. rm tolerates a path whose parent is now a file.
put_back() {
  local rev="$1" idx="$SHARD_SESSION/revert-gate.index" p
  shift
  local present=()
  for p in "$@"; do
    case "$(git -C "$WORK" cat-file -t "$rev:$p" 2>/dev/null)" in
      blob|commit) present+=("$p") ;;
      *) rm -f "$WORK/$p" 2>/dev/null || true ;;
    esac
  done
  [ ${#present[@]} -gt 0 ] || return 0
  rm -f "$idx"
  GIT_INDEX_FILE="$idx" git -C "$WORK" read-tree "$rev"
  GIT_INDEX_FILE="$idx" git -C "$WORK" checkout-index -f -- "${present[@]}"
  rm -f "$idx"
}

restore() { [ ${#own[@]} -eq 0 ] || put_back HEAD "${own[@]}"; }

on_signal() {
  restore || true
  printf '%s\n' "ERROR interrupted"
  exit 1
}

run_suite() { # HEADER -> sets rc
  printf '### %s\n' "$1" >>"$LOG"
  rc=0
  ( cd "$WORK" && CF_BOUNDED_STALL_MARK="$STALL_MARK" run_bounded "$DEADLINE" "${CMD[@]}" ) >>"$LOG" 2>&1 || rc=$?
  printf 'exit=%s\n' "$rc" >>"$LOG"
}

[ $# -ge 2 ] || verdict "ERROR usage" 1
# Absolute, because git -C "$WORK" and the run inside $WORK would resolve a
# relative scratch index or stall mark against $WORK, not the caller's cwd.
SHARD_SESSION=$(cd "$1" 2>/dev/null && pwd) || verdict "ERROR session env.sh" 1
shift
CMD=("$@")
LOG="$SHARD_SESSION/revert-gate.log"
STALL_MARK="$SHARD_SESSION/revert-gate-stalled.mark"
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

# Non-git scratch mode is the only bypass; every other failure below is an ERROR.
[ -n "${REPO_ROOT:-}" ] || verdict "SKIPPED no-git" 0
# Exit status only: a git that exits 0 and prints nothing is a clean repository.
git -C "$WORK" rev-parse --is-inside-work-tree >/dev/null 2>&1 || verdict "ERROR work-tree-missing" 1
[ -n "${BASE_HEAD:-}" ] && git -C "$WORK" rev-parse --quiet --verify "$BASE_HEAD^{commit}" >/dev/null 2>&1 \
  || verdict "ERROR base-head-unresolvable" 1

# The set cf-pi-scope.sh charges (cf_own_paths in cf-pi-env.sh).
own_log() { cf_own_paths "$WORK" "$BASE_HEAD" "$SHARD_SESSION"; }
# Run twice: a variable cannot hold NULs, and a process substitution's status is
# lost. A failed lookup (a prerequisite ref gone) is not an empty set: that would
# judge the unchanged tree and name every contract.
own_log >/dev/null 2>&1 || verdict "ERROR own-paths-unresolvable" 1
own=()
while IFS= read -r -d '' p; do
  if [ -n "$p" ]; then own+=("$p"); fi
done < <(own_log 2>/dev/null | sort -zu)

# No own paths means an empty pathspec, which is the whole tree: skip the check.
dirty=""
[ ${#own[@]} -eq 0 ] || dirty=$(own_status)
[ -z "$dirty" ] || verdict "ERROR dirty-own-paths $dirty" 1

# From here on the tree changes. bash runs a signal trap once the current run
# returns, so the restore happens before the exit rather than instantly.
trap 'restore || true' EXIT
trap on_signal INT TERM HUP

: >"$LOG"
run_suite control
[ ! -f "$STALL_MARK" ] || verdict "ERROR control-stalled ${DEADLINE}s" 1
[ "$rc" -eq 0 ] || verdict "ERROR control-red" 1

green=""
for name in ${contracts[@]+"${contracts[@]}"}; do
  touches=$(jq -r --arg n "$name" '.contracts[] | select(.name == $n) | .touches_files[]?' "$CONTRACTS_FILE")
  # The contract's own test_files decide; a plan without the field falls back to
  # the path rule, which misreads layouts such as spec/scripts/*.sh.
  tests=$(jq -r --arg n "$name" '.contracts[] | select(.name == $n) | .test_files // empty | .[]' "$CONTRACTS_FILE")
  has_tests=$(jq -r --arg n "$name" '.contracts[] | select(.name == $n) | has("test_files")' "$CONTRACTS_FILE")
  revert=()
  for p in ${own[@]+"${own[@]}"}; do
    if printf '%s\n' "$p" | grep -Eq "$CF_BUILD_LOCK_ALLOWLIST"; then continue; fi
    if [ "$has_tests" = true ]; then
      if printf '%s\n' "$tests" | grep -Fxq -- "$p"; then continue; fi
    elif is_test_path "$p" && printf '%s\n' "$touches" | grep -Fxq -- "$p"; then continue; fi
    revert+=("$p")
  done
  [ ${#revert[@]} -eq 0 ] || put_back "$BASE_HEAD" "${revert[@]}"
  run_suite "$name"
  restore || true
  [ "$rc" -ne 0 ] || green="${green:+$green,}$name"
done

dirty=""
[ ${#own[@]} -eq 0 ] || dirty=$(own_status)
[ -z "$dirty" ] || verdict "ERROR restore-failed $dirty" 1

[ -z "$green" ] || verdict "STAYS_GREEN $green" 2
verdict "CLEAN ${#contracts[@]}" 0
