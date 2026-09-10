#!/usr/bin/env bash
# shim-test.sh — committed behavior test for shims/git. Pure-local, real git,
# no pi, no network. Two scratch repos: WORK (the worktree) and OTHER (the
# human's checkout). The shim is first on PATH with PI_CWD=WORK, exactly as
# pi-dispatch.sh arranges for a worker; commands run through `bash -c` so the
# shell expands quotes, variables, subshells and cd the way a worker's shell would.
#
# Returns 0 iff every assertion holds.

set -uo pipefail

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "ok   - $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIMS="$(cd "$SCRIPT_DIR/../shims" && pwd -P)"
REAL_GIT="$(command -v git)"

# Fixtures live under /tmp, NOT the per-user temp dir: that dir is the fence's
# escape hatch for test scaffolding, so repos there would never be refused.
TMP="$(mktemp -d /tmp/shim-test.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
WORK="$TMP/shards/A/work"; OTHER="$TMP/real-repo"
mkdir -p "$WORK" "$OTHER"
for r in "$WORK" "$OTHER"; do
  "$REAL_GIT" -C "$r" init -q
  "$REAL_GIT" -C "$r" -c user.name=t -c user.email=t@t commit -q --allow-empty -m "chore: init"
done
head_of() { "$REAL_GIT" -C "$1" rev-parse HEAD; }
OTHER_HEAD="$(head_of "$OTHER")"

# run <label> <expect: pass|block> <command>   — runs from inside WORK
run() {
  local label="$1" expect="$2" cmd="$3" rc out
  out="$(cd "$WORK" && PATH="$SHIMS:$PATH" PI_REAL_GIT="$REAL_GIT" PI_CWD="$WORK" OTHER="$OTHER" WORK="$WORK" TMP="$TMP" \
         GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t \
         bash -c "$cmd" 2>&1)"; rc=$?
  case "$expect" in
    block) if [ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'BLOCKED by worktree-fence'; then ok "$label"; else bad "$label (rc=$rc: $(printf '%s' "$out" | head -1))"; fi ;;
    pass)  if [ $rc -eq 0 ] && ! printf '%s' "$out" | grep -q 'BLOCKED'; then ok "$label"; else bad "$label (rc=$rc: $(printf '%s' "$out" | head -1))"; fi ;;
  esac
}

# --- the measured incident shapes ---
run "bare commit lands in the worktree"            pass  'git commit --allow-empty -m "chore: bare"'
run "git -C OTHER reset --hard"                    block 'git -C "$OTHER" reset --hard HEAD'
run "git -C OTHER reset --mixed HEAD~1"            block 'git -C "$OTHER" reset --mixed HEAD~1'

# --- the shapes the regex fence missed ---
run "quoted -C path"                               block 'git -C "$OTHER" commit --allow-empty -m "chore: x"'
run "subshell (cd OTHER && git commit)"            block '(cd "$OTHER" && git commit --allow-empty -m "chore: x")'
run "cd \$VAR && git commit"                       block 'cd "$OTHER" && git add -A && git commit --allow-empty -m "chore: x"'
run "GIT_DIR= prefix"                              block 'GIT_DIR="$OTHER/.git" GIT_WORK_TREE="$OTHER" git commit --allow-empty -m "chore: x"'
run "--git-dir global option"                      block 'git --git-dir="$OTHER/.git" --work-tree="$OTHER" commit --allow-empty -m "chore: x"'
run "pushd OTHER && git commit"                    block 'pushd "$OTHER" >/dev/null && git commit --allow-empty -m "chore: x"'
run "nested bash -c"                               block 'bash -c "cd \"$OTHER\" && git commit --allow-empty -m \"chore: x\""'
run "git init outside (absolute)"                  block 'git init "$TMP/new-repo"'
run "git clone with options before the source"     block 'git clone --depth 1 "$OTHER" "$TMP/clone-out"'
run "GIT_DIR only, no work tree"                   block 'GIT_DIR="$OTHER/.git" git commit --allow-empty -m "chore: x"'
run "alias to a mutating verb"                     block 'git -c alias.ci=commit -C "$OTHER" ci --allow-empty -m "chore: x"'
run "shell alias"                                  block 'git -c "alias.boom=!true" -C "$OTHER" boom'
run "config write on OTHER"                        block 'git -C "$OTHER" config core.hooksPath /x'
run "remote set-url on OTHER"                      block 'git -C "$OTHER" remote add up /dev/null'
run "unknown verb is denied by default"            block 'git -C "$OTHER" frobnicate'
run "stash on OTHER"                               block 'git -C "$OTHER" stash'
run "worktree add from OTHER"                      block 'git -C "$OTHER" worktree add "$OTHER-wt" -b wt' 

# --- what must pass ---
run "read-only against OTHER"                      pass  'git -C "$OTHER" log -1 --oneline && git -C "$OTHER" status -sb && git -C "$OTHER" diff && git -C "$OTHER" branch --show-current'
run "list forms against OTHER"                     pass  'git -C "$OTHER" branch -a && git -C "$OTHER" tag -l && git -C "$OTHER" stash list && git -C "$OTHER" worktree list'
run "cd into the worktree then commit"             pass  'cd "$WORK" && git add -A && git commit --allow-empty -m "chore: y"'
run "git -C WORK, resolved form"                   pass  "git -C $(cd "$WORK" && pwd -P) commit --allow-empty -m 'chore: z'"
run "subdir of the worktree"                       pass  'mkdir -p sub && cd sub && git commit --allow-empty -m "chore: sub"'
run "-c option before the verb"                    pass  'git -c core.editor=true commit --allow-empty -m "chore: c"'
run "git init inside the worktree"                 pass  'git init inner-repo'
run "worktree add from the worktree"               pass  'git worktree add "$WORK-wt2" -b wt2 && git worktree remove "$WORK-wt2"'
run "config read on OTHER"                         pass  'git -C "$OTHER" config --get user.name; git -C "$OTHER" config -l >/dev/null; git -C "$OTHER" config core.bare'
run "remote -v and reflog on OTHER"                pass  'git -C "$OTHER" remote -v && git -C "$OTHER" reflog >/dev/null'
run "alias to a read verb on OTHER"                pass  'git -c alias.st=status -C "$OTHER" st -sb'
run "scratch repo under \$TMPDIR (test fixtures)"  pass  'd=$(mktemp -d) && git -C "$d" init -q && git -C "$d" commit --allow-empty -q -m "chore: fixture" && git -C "$d" reset --hard -q HEAD'
run "linked worktree of a parent repo"             pass  'p=$(mktemp -d) && git -C "$p" init -q && git -C "$p" commit -q --allow-empty -m "chore: p" && git -C "$p" worktree add -q "$TMP/linked" -b lk && PI_CWD="$TMP/linked" git -C "$TMP/linked" commit -q --allow-empty -m "chore: in-linked"'

# --- a linked worktree of the human's checkout shares its refs ---
git_real() { "$REAL_GIT" -c user.name=t -c user.email=t@t "$@"; }
git_real -C "$OTHER" branch keep-me >/dev/null
git_real -C "$OTHER" worktree add -q "$TMP/linked-wt" -b shard-branch
LINKED="$TMP/linked-wt"
runl() { # like run, but PI_CWD is the linked worktree
  local label="$1" expect="$2" cmd="$3" rc out
  out="$(cd "$LINKED" && PATH="$SHIMS:$PATH" PI_REAL_GIT="$REAL_GIT" PI_CWD="$LINKED" OTHER="$OTHER" \
         GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@t GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@t bash -c "$cmd" 2>&1)"; rc=$?
  case "$expect" in
    block) if [ $rc -ne 0 ] && printf '%s' "$out" | grep -q 'BLOCKED by worktree-fence'; then ok "$label"; else bad "$label (rc=$rc: $(printf '%s' "$out" | head -1))"; fi ;;
    pass)  if [ $rc -eq 0 ] && ! printf '%s' "$out" | grep -q 'BLOCKED'; then ok "$label"; else bad "$label (rc=$rc: $(printf '%s' "$out" | head -1))"; fi ;;
  esac
}
runl "linked: commit on its own branch"            pass  'git commit --allow-empty -m "chore: shard"'
runl "linked: branch -D of a shared branch"        block 'git branch -D keep-me'
runl "linked: update-ref on a shared ref"          block 'git update-ref refs/heads/keep-me HEAD'
runl "linked: tag creation in the shared repo"     block 'git tag v-shard'
runl "linked: worktree prune of the shared repo"   block 'git worktree prune'
runl "linked: read-only branch list"               pass  'git branch --list && git tag -l'
if git_real -C "$OTHER" rev-parse --verify -q keep-me >/dev/null; then ok "shared branch survived"; else bad "shared branch was deleted"; fi

# --- config outside the repo ---
HOME_SAVED="$HOME"; export HOME="$TMP/home"; mkdir -p "$HOME"
run "config --global writes \$HOME"                block 'git config --global user.name x'
run "config --file outside"                        block 'git config --file "$OTHER/.git/config" user.name x'
run "config --file inside the worktree"            pass  'git config --file .gitconfig-local user.name x'
export HOME="$HOME_SAVED"

# --- the receipt: OTHER never moved ---
if [ "$(head_of "$OTHER")" = "$OTHER_HEAD" ] && [ -z "$("$REAL_GIT" -C "$OTHER" status --porcelain)" ]; then ok "OTHER HEAD and tree untouched"; else bad "OTHER changed"; fi
if [ "$("$REAL_GIT" -C "$WORK" log --oneline | wc -l | tr -d ' ')" -ge 4 ]; then ok "worktree received the in-bounds commits"; else bad "worktree commits missing"; fi

# --- without PI_CWD the shim is transparent; without PI_REAL_GIT it refuses loudly ---
out="$(cd "$OTHER" && PATH="$SHIMS:$PATH" PI_REAL_GIT="$REAL_GIT" env -u PI_CWD bash -c 'git commit --allow-empty -m "chore: free" -q && git log -1 --format=%s' 2>&1)"
if [ "$out" = "chore: free" ]; then ok "PI_CWD unset -> passthrough"; else bad "PI_CWD unset -> $out"; fi
out="$(cd "$OTHER" && PATH="$SHIMS:$PATH" env -u PI_REAL_GIT bash -c 'git status' 2>&1)"; rc=$?
if [ $rc -eq 127 ] && printf '%s' "$out" | grep -q 'PI_REAL_GIT'; then ok "PI_REAL_GIT unset -> exit 127, never execs itself"; else bad "PI_REAL_GIT unset -> rc=$rc $out"; fi

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
