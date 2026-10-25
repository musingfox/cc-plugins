#!/usr/bin/env bash
# Gate: every contract must have a test that goes red once the builder's own
# implementation is put back to BASE. A test that stays green without the code it
# claims to cover proves nothing, and the scope gate and a green suite both let
# it through.
#
# Usage:   cf-revert-gate.sh --repo DIR --base REV --head REV --contracts FILE \
#                            --out DIR -- TEST_CMD [ARGS...]
#          DIR may be any directory inside the repository; the gate works on its top level.
#          --base and --head are any revs that resolve to commits in DIR;
#          FILE is cf:plan's contracts.json (schema_version 1).
#
# One control run at head, then one run per contract in .contracts[] order. A
# contract's run puts every own path (the paths the commits in base..head
# changed) back to base, except root build/lock manifests, which a run needs to
# install or build, and that contract's own tests: its `test_files`, or without
# the field, its touches_files that look like tests. A run that exits non-zero,
# or is killed at the deadline, went red.
#
# The control run's output follows what a builder's test gate needs to read: the
# exit code, the runner's own summary quoted (an exit code cannot tell a green
# suite from one that skipped everything), then the tail of the log:
#   test_exit=<n>
#   test_counts=<quoted summary line(s) | unparsed>
#   the last 15 log lines on green; the last 30 plus up to 10 failure-marker
#   lines on red
#
# Stdout ends with exactly one verdict line:
#   CLEAN <n>                 exit 0    all n contracts went red
#   STAYS_GREEN <A>[,<B>...]  exit 2    these contracts' runs exited 0
#   TESTS_RED <test_exit>     exit 3    the control run was red; no contract run
#   TESTS_STALLED <seconds>   exit 124  the control run outran the deadline
#   ERROR <reason>            exit 1    no verdict
# An empty range (no commit in base..head) is `ERROR empty-range`; no suite runs.
# Bad or missing input is a lone ERROR line, and TEST_CMD never runs. jq absent
# is `ERROR jq-missing`.
#
# Log:     <out>/revert-gate.log, one `### <run>` section per run, each ending in
#          an exit=<n> line the gate writes.
# Env:     CF_TEST_DEADLINE_S  seconds before a run is group-killed (default 1800)
#
# Every run gets /dev/null on stdin. TEST_CMD runs exactly as given, in a
# detached worktree the gate creates at --head under a fresh temporary directory
# and removes on every exit path, signals included. DIR's checkout, index,
# branches, tags and stash are never touched, and no repo hook fires.

# jq first, and with builtins alone: with nothing on PATH the error still prints.
command -v jq >/dev/null 2>&1 || { echo "ERROR jq-missing"; exit 1; }

# The gate's own commands run in the C locale; TEST_CMD gets the caller's
# LC_ALL back (or none), see run_suite.
if [ -n "${LC_ALL+x}" ]; then caller_lc_all=("LC_ALL=$LC_ALL"); else caller_lc_all=(-u LC_ALL); fi
export LC_ALL=C

# Root build/lock manifests a builder may touch: an isolated worktree may have to
# add a missing dev dependency to run its tests (e.g. `uv add --dev pytest`).
# The scope gate reports them instead of failing; this gate never reverts them,
# because a run needs them to install or build. cf-scope.sh carries the same line.
CF_BUILD_LOCK_ALLOWLIST='^(pyproject\.toml|uv\.lock|requirements[^/]*\.txt|package\.json|package-lock\.json|bun\.lock(b)?|yarn\.lock|pnpm-lock\.yaml|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?)$'

tmp="" wt="" wt_admin="" sup=""

# cleanup: the worktree and the temporary directory, on every exit path.
cleanup() {
  if [ -n "$wt" ]; then
    git -c core.hooksPath=/dev/null -C "$repo" worktree remove --force "$wt" >/dev/null 2>&1 || true
    # a remove that failed must not leave an entry in `git worktree list`
    [ -z "$wt_admin" ] || rm -rf "$wt_admin"
  fi
  [ -z "$tmp" ] || rm -rf "$tmp"
  tmp="" wt="" wt_admin=""
}
trap cleanup EXIT

verdict() {
  printf '%s\n' "$1"
  exit "$2"
}
fail() { verdict "ERROR $1" 1; }

# A signal ends the supervisor and, through it, the suite's whole tree, then the
# worktree goes. bash runs the trap as soon as `wait` is interrupted.
on_signal() {
  trap '' INT TERM HUP
  if [ -n "$sup" ]; then
    kill -TERM "$sup" 2>/dev/null
    wait "$sup" 2>/dev/null
  fi
  cleanup
  verdict "ERROR interrupted" 1
}
trap on_signal INT TERM HUP

is_test_path() {
  case "/$1" in
    */test/*|*/tests/*|*/__tests__/*|*/spec/*) return 0 ;;
  esac
  case "${1##*/}" in
    *.test.*|*_test.*|test_*|*.spec.*|*_spec.*) return 0 ;;
  esac
  return 1
}

# test_counts_of LOG
#   Echoes the runner's own summary line(s) from LOG, or "unparsed".
#
#   Quoted, never recomputed: whichever shape the runner prints ("24 passed, 0
#   failed", "10 passing" + "2 pending", bun's "47 pass" + "0 fail", "tests: 24,
#   failed: 0") is reported as written, because a per-runner parser is wrong for
#   the next runner. The LAST few matching lines win -- runners print per-file
#   lines before the summary.
test_counts_of() {
  local counts
  counts="$(grep -iE '[0-9]+ (pass|passed|passing|fail|failed|failing|skipped|pending|todo|ignored)|(tests|failures|passed|failed|skipped)[:=] ?[0-9]+' \
    "$1" 2>/dev/null | tail -3 | paste -sd'|' - | tr -s ' ' | cut -c1-240 || true)"
  printf '%s' "${counts:-unparsed}"
}

# BOUNDED_PL: the supervisor run_suite starts for every run, as `perl -e`
#   Runs CMD in DIR, in its own session + process group, with /dev/null on stdin,
#   and group-kills the whole tree if it outruns DEADLINE_S. Exits with the
#   command's exit code, or 124 on the deadline (timeout(1)'s convention; macOS
#   ships no timeout(1), hence perl).
#
#   124 alone does not identify a deadline kill: `timeout 600 npm test` is an
#   ordinary thing to write as a test runner, and its own timeout exits 124 too.
#   So the deadline is reported out of band: the supervisor creates the file
#   named by its first argument if, and only if, it killed the tree itself.
#
#   The mark's path is an argument, not an environment variable: the suite
#   inherits the supervisor's environment and must not see the gate's.
#
#   The supervisor leaves the caller's process group before forking. The child
#   has its own session, so killing the caller's group would otherwise take the
#   supervisor down and leave the suite running with nothing left to enforce the
#   deadline. A TERM, INT or HUP to the supervisor kills the child's tree too.
#   It is a job of its own, not a shell function: a signal sent to a subshell
#   would stop at the subshell and leave the suite running.
BOUNDED_PL='
  POSIX::setpgid(0, 0);
  my $mark = shift @ARGV;
  my $deadline = shift @ARGV;
  my $dir = shift @ARGV;
  my $pid = fork();
  exit 127 unless defined $pid;
  if ($pid == 0) { POSIX::setsid(); chdir($dir) or exit 127; exec { $ARGV[0] } @ARGV; exit 127; }
  my $stop = sub {
    kill("TERM", -$pid); select(undef, undef, undef, 1); kill("KILL", -$pid);
    waitpid($pid, 0);
    exit 143;
  };
  $SIG{TERM} = $SIG{INT} = $SIG{HUP} = $stop;
  my $waited = 0;
  while (1) {
    last if waitpid($pid, POSIX::WNOHANG()) == $pid;
    if ($waited >= $deadline) {
      kill("TERM", -$pid); sleep 2; kill("KILL", -$pid);
      waitpid($pid, 0);
      if ($mark && open(my $m, ">", $mark)) { print $m "$deadline\n"; close $m; }
      exit 124;
    }
    select(undef, undef, undef, 0.2);
    $waited += 0.2;
  }
  my $st = $?;
  exit($st & 127 ? 128 + ($st & 127) : $st >> 8);
'

# whole_lines: stdin to stdout with a newline ending the last line. A suite's
# output may stop mid-line, and the verdict must start its own.
whole_lines() { awk '1'; }

# run_suite HEADER -> sets rc. The output goes straight to the log, so a long run
# can be read while it goes; the run is a background job so a signal reaches the
# trap at once instead of after the suite.
run_suite() {
  # the previous run may have ended mid-line; the header starts its own
  [ -z "$(tail -c 1 "$LOG")" ] || echo >>"$LOG"
  printf '### %s\n' "$1" >>"$LOG"
  rm -f "$STALL_MARK"
  env "${caller_lc_all[@]}" perl -MPOSIX -e "$BOUNDED_PL" "$STALL_MARK" "$DEADLINE" "$wt" "${CMD[@]}" >>"$LOG" 2>&1 < /dev/null &
  sup=$!
  rc=0
  wait "$sup" || rc=$?
  sup=""
}
end_run() {
  [ -z "$(tail -c 1 "$LOG")" ] || echo >>"$LOG"
  printf 'exit=%s\n' "$rc" >>"$LOG"
}

# put_back REV PATH...: each path to its state at REV, deleted when REV lacks it.
# Plumbing through a scratch index: the worktree's own index stays as the
# checkout left it.
# Only a blob or gitlink at REV is written. A tree at REV means the path was a
# directory there, and its files are in the list themselves, so whatever file
# stands in its place goes. rm tolerates a path whose parent is now a file.
put_back() {
  local rev="$1" idx="$tmp/revert.index" p
  shift
  local present=()
  for p in "$@"; do
    case "$(git -C "$wt" cat-file -t "$rev:$p" 2>/dev/null)" in
      blob|commit) present+=("$p") ;;
      *) rm -f "$wt/$p" 2>/dev/null || true ;;
    esac
  done
  [ ${#present[@]} -gt 0 ] || return 0
  rm -f "$idx"
  GIT_INDEX_FILE="$idx" git -c core.hooksPath=/dev/null -C "$wt" read-tree "$rev" || { rm -f "$idx"; return 1; }
  GIT_INDEX_FILE="$idx" git -c core.hooksPath=/dev/null -C "$wt" checkout-index -f -- "${present[@]}" || { rm -f "$idx"; return 1; }
  rm -f "$idx"
}

restore() { [ ${#own[@]} -eq 0 ] || put_back "$head_sha" "${own[@]}"; }

# Porcelain status of the own paths only, as a csv.
own_status() {
  git -C "$wt" --literal-pathspecs status --porcelain -z --no-renames -- ${own[@]+"${own[@]}"} \
    | while IFS= read -r -d '' rec; do printf '%s\n' "${rec:3}"; done | sort -u | paste -sd, -
}

# ---- input ----

repo="" base="" head="" contracts="" out="" CMD=()
while [ $# -gt 0 ]; do
  case "$1" in
    --)
      shift
      CMD=("$@")
      break ;;
    --repo|--base|--head|--contracts|--out)
      [ $# -ge 2 ] || fail "usage: $1 needs a value"
      case "$1" in
        --repo) repo="$2" ;;
        --base) base="$2" ;;
        --head) head="$2" ;;
        --contracts) contracts="$2" ;;
        --out) out="$2" ;;
      esac
      shift 2 ;;
    *) fail "usage: unknown argument $1" ;;
  esac
done
[ -n "$repo" ] || fail "usage: --repo is required"
[ -n "$base" ] || fail "usage: --base is required"
[ -n "$head" ] || fail "usage: --head is required"
[ -n "$contracts" ] || fail "usage: --contracts is required"
[ -n "$out" ] || fail "usage: --out is required"
[ ${#CMD[@]} -gt 0 ] || fail "usage: -- TEST_CMD [ARGS...] is required"

DEADLINE="${CF_TEST_DEADLINE_S:-1800}"
case "$DEADLINE" in
  ''|*[!0-9]*|0) fail "bad-deadline" ;;
esac

[ -d "$repo" ] || fail "repo-not-a-directory"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || fail "repo-not-a-git-repo"
repo=$(cd "$repo" && pwd)
# Contract paths are repo-root relative: a --repo inside the repository means its
# top level. A bare repository has none and stays as given.
top=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) && repo="$top"
base_sha=$(git -C "$repo" rev-parse --verify --quiet "$base^{commit}" 2>/dev/null) || fail "base-unresolvable"
head_sha=$(git -C "$repo" rev-parse --verify --quiet "$head^{commit}" 2>/dev/null) || fail "head-unresolvable"

[ -f "$contracts" ] || fail "contracts-unreadable"
contracts="$(cd "$(dirname "$contracts")" && pwd)/$(basename "$contracts")"
jq -e '
  type == "object" and .schema_version == 1 and (.contracts | type == "array")
  and all(.contracts[];
    type == "object"
    and (.name | type == "string")
    and (.touches_files | type == "array") and all(.touches_files[]; type == "string")
    and ((has("test_files") | not) or ((.test_files | type == "array") and all(.test_files[]; type == "string"))))
' "$contracts" >/dev/null 2>&1 || fail "contracts-malformed"

# No commit in base..head is no evidence either way: the gate refuses it.
[ "$(git -C "$repo" rev-list --count "$base_sha..$head_sha" 2>/dev/null)" -gt 0 ] 2>/dev/null || fail "empty-range"

mkdir -p "$out" 2>/dev/null && [ -d "$out" ] && [ -w "$out" ] || fail "out-unusable"
out=$(cd "$out" && pwd)
LOG="$out/revert-gate.log"
: >"$LOG" 2>/dev/null || fail "out-unusable"

# The set cf-scope.sh charges: the commit union of base..head.
# --no-renames: rename detection lists only the new name, so the old path would
#   escape the gate.
# -z: git C-quotes a name holding a quote, backslash or control character even
#   with core.quotePath=false, and a quoted name matches no declared path.
own_log() { git -C "$repo" log -z --no-renames --name-only --pretty=format: "$base_sha..$head_sha"; }
# Run twice: a variable cannot hold NULs, and a process substitution's status is
# lost. A failed lookup is not an empty set: that would judge the unchanged tree.
own_log >/dev/null 2>&1 || fail "own-paths-unresolvable"
own=()
while IFS= read -r -d '' p; do
  if [ -n "$p" ]; then own+=("$p"); fi
done < <(own_log 2>/dev/null | sort -zu)

# ---- the worktree ----

tmp=$(mktemp -d "${TMPDIR:-/tmp}/cf-revert-gate.XXXXXX") || fail "tmpdir-unusable"
STALL_MARK="$tmp/stalled.mark"
wt="$tmp/wt"
# --no-checkout, then a reset: `worktree add` runs the post-checkout hook after a
# checkout, and the repo's hooks are not this gate's to run.
git -c core.hooksPath=/dev/null -C "$repo" worktree add --quiet --no-checkout --detach "$wt" "$head_sha" >/dev/null 2>&1 \
  || { wt=""; fail "worktree-failed"; }
wt_admin=$(git -C "$wt" rev-parse --absolute-git-dir 2>/dev/null) || wt_admin=""
git -c core.hooksPath=/dev/null -C "$wt" reset --quiet --hard "$head_sha" >/dev/null 2>&1 || fail "worktree-failed"

# ---- the control run ----
# -- control run --
run_suite control
control_out="$tmp/control.out"
tail -n +2 "$LOG" >"$control_out"
end_run
if [ -f "$STALL_MARK" ]; then
  tail -n 30 "$control_out" | whole_lines
  verdict "TESTS_STALLED $DEADLINE" 124
fi
echo "test_exit=$rc"
echo "test_counts=$(test_counts_of "$control_out")"
if [ "$rc" -eq 0 ]; then
  tail -n 15 "$control_out" | whole_lines
else
  tail -n 30 "$control_out" | whole_lines
  echo "--- failure markers ---"
  { grep -m 10 -E '(FAIL|failed|error\[|panicked|AssertionError)' "$control_out" | head -c 3000 || true; } | whole_lines
  verdict "TESTS_RED $rc" 3
fi
# -- end control run --

# ---- one run per contract ----
n=$(jq '.contracts | length' "$contracts")
green=""
# -- contract runs --
i=0
while [ "$i" -lt "$n" ]; do
  name=$(jq -r --argjson i "$i" '.contracts[$i].name' "$contracts")
  touches=$(jq -r --argjson i "$i" '.contracts[$i].touches_files[]' "$contracts")
  # The contract's own test_files decide; a plan without the field falls back to
  # the path rule, which misreads layouts such as spec/scripts/*.sh.
  tests=$(jq -r --argjson i "$i" '.contracts[$i].test_files // [] | .[]' "$contracts")
  has_tests=$(jq -r --argjson i "$i" '.contracts[$i] | has("test_files")' "$contracts")
  revert=()
  for p in ${own[@]+"${own[@]}"}; do
    if printf '%s\n' "$p" | grep -Eq "$CF_BUILD_LOCK_ALLOWLIST"; then continue; fi
    if [ "$has_tests" = true ]; then
      if printf '%s\n' "$tests" | grep -Fxq -- "$p"; then continue; fi
    elif is_test_path "$p" && printf '%s\n' "$touches" | grep -Fxq -- "$p"; then continue; fi
    revert+=("$p")
  done
  if [ ${#revert[@]} -gt 0 ]; then
    put_back "$base_sha" "${revert[@]}" || fail "revert-failed"
  fi
  run_suite "$name"
  end_run
  restore || fail "restore-failed"
  [ "$rc" -ne 0 ] || green="${green:+$green,}$name"
  i=$((i + 1))
done

dirty=""
[ ${#own[@]} -eq 0 ] || dirty=$(own_status)
[ -z "$dirty" ] || fail "restore-failed $dirty"
# -- end contract runs --

[ -z "$green" ] || verdict "STAYS_GREEN $green" 2
verdict "CLEAN $n" 0
