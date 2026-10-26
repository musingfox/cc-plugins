#!/usr/bin/env bash
# Gate: the files a builder changed are a subset of the files its contracts declared.
#
# The only deterministic guard against a builder leaving files in the user's
# project that no contract declared. `git status --porcelain` is NOT a
# substitute: the builder commits with `git add -A`, and porcelain is blind to
# anything already committed.
#
# Usage:   scope-gate.sh --repo DIR --base REV --head REV --contracts FILE
#          DIR may be any directory inside the repository; the gate works on its top level.
#          --base and --head are any revs that resolve to commits in DIR;
#          FILE is a contracts.json (schema_version 1), as method/skills/method/contracts.md writes it.
# Stdout:  ALLOWLISTED <csv>   (only when non-empty -- build/lock manifests and
#                               hook-made plugin version bumps)
#          UNDECLARED  <csv>   (only when non-empty -- scope violation)
#          ERROR <reason>      (alone, on missing or bad input)
#          ERROR empty-range   when base..head holds no commit (base equal to head,
#                               or a descendant of it)
# Exit:    0 = clean (allowlisted touches still exit 0)
#          2 = undeclared files present
#          1 = error
#
# Own paths: the union of paths changed by the commits in base..head. Commit
# union, not net diff, on purpose: the gate asks whether the builder touched an
# undeclared file, not what survived. A file created and deleted again still
# collided with whatever contract actually owns it. A merge commit adds no path
# of its own, but the commits it merged in are in the range: to leave a merged
# prerequisite out, pass the merge commit as --base.
#
# The gate reads commits only. It never touches DIR's checkout, index, branches,
# tags or stash, and needs no worktree of its own.

# jq first, and with builtins alone: with nothing on PATH the error still prints.
command -v jq >/dev/null 2>&1 || { echo "ERROR jq-missing"; exit 1; }

export LC_ALL=C

# Root build/lock manifests a builder may touch: an isolated worktree may have to
# add a missing dev dependency to run its tests (e.g. `uv add --dev pytest`).
# The scope gate reports them instead of failing; the revert gate never reverts
# them, because a run needs them to install or build. revert-gate.sh carries
# the same line.
METHOD_BUILD_LOCK_ALLOWLIST='^(pyproject\.toml|uv\.lock|requirements[^/]*\.txt|package\.json|package-lock\.json|bun\.lock(b)?|yarn\.lock|pnpm-lock\.yaml|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?)$'

fail() { printf 'ERROR %s\n' "$1"; exit 1; }

repo="" base="" head="" contracts=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo|--base|--head|--contracts)
      [ $# -ge 2 ] || fail "usage: $1 needs a value"
      case "$1" in
        --repo) repo="$2" ;;
        --base) base="$2" ;;
        --head) head="$2" ;;
        --contracts) contracts="$2" ;;
      esac
      shift 2 ;;
    *) fail "usage: unknown argument $1" ;;
  esac
done
[ -n "$repo" ] || fail "usage: --repo is required"
[ -n "$base" ] || fail "usage: --base is required"
[ -n "$head" ] || fail "usage: --head is required"
[ -n "$contracts" ] || fail "usage: --contracts is required"

[ -d "$repo" ] || fail "repo-not-a-directory"
git -C "$repo" rev-parse --git-dir >/dev/null 2>&1 || fail "repo-not-a-git-repo"
# Contract paths are repo-root relative: a --repo inside the repository means its
# top level. A bare repository has none and stays as given.
top=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) && repo="$top"
base_sha=$(git -C "$repo" rev-parse --verify --quiet "$base^{commit}" 2>/dev/null) || fail "base-unresolvable"
head_sha=$(git -C "$repo" rev-parse --verify --quiet "$head^{commit}" 2>/dev/null) || fail "head-unresolvable"

[ -f "$contracts" ] || fail "contracts-unreadable"
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

declared=$(jq -r '.contracts[].touches_files[]' "$contracts" | sort -u) || fail "contracts-malformed"

# --no-renames: rename detection lists only the new name, so the old path
#   would escape the gate.
# -z: git C-quotes a name holding a quote, backslash or control character even
#   with core.quotePath=false, and a quoted name matches no declared path.
own=$(git -C "$repo" log -z --no-renames --name-only --pretty=format: "$base_sha..$head_sha" 2>/dev/null \
        | tr '\0' '\n' | sed '/^$/d' | sort -u; [ "${PIPESTATUS[0]}" -eq 0 ]) || fail "own-paths-unresolvable"

undeclared=""
if [ -n "$own" ]; then
  undeclared=$(comm -23 <(printf '%s\n' "$own") <(printf '%s\n' "$declared"))
fi

allowlisted=""
if [ -n "$undeclared" ]; then
  allowlisted=$(printf '%s\n' "$undeclared" | grep -E "$METHOD_BUILD_LOCK_ALLOWLIST" || true)
  undeclared=$(printf '%s\n' "$undeclared" | grep -vE "$METHOD_BUILD_LOCK_ALLOWLIST" || true)
fi

# .githooks/pre-commit bumps <plugin>/.claude-plugin/plugin.json inside the
# first commit that touches the plugin. That edit is the hook's, so a manifest
# whose every changed line, in every commit, is its "version" line is
# allowlisted; any other line in it is still the builder's undeclared touch.
# Only the top-level "version" key is the hook's: a nested object's "version"
# line has the same shape, so each commit must also leave everything but the
# top-level key as it found it.
version_only_bump() {
  local changed c
  while IFS= read -r c; do
    jq -en --slurpfile a <(git -C "$repo" show "$c^:$1" 2>/dev/null) \
           --slurpfile b <(git -C "$repo" show "$c:$1" 2>/dev/null) \
      '($a | length) == 1 and ($b | length) == 1
       and ($a[0] | type) == "object" and ($b[0] | type) == "object"
       and ($a[0] | del(.version)) == ($b[0] | del(.version))' >/dev/null 2>&1 || return 1
  done < <(git --literal-pathspecs -C "$repo" rev-list --no-merges "$base_sha..$head_sha" -- "$1" 2>/dev/null)
  changed=$(git --literal-pathspecs -C "$repo" log -p --no-renames --no-color --no-ext-diff --pretty=format: \
              "$base_sha..$head_sha" -- "$1" 2>/dev/null \
            | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ' || true)
  [ -n "$changed" ] && ! printf '%s\n' "$changed" | grep -qvE '^[+-][[:space:]]*"version"[[:space:]]*:'
}
if [ -n "$undeclared" ]; then
  rest=""
  while IFS= read -r f; do
    if [[ "$f" =~ (^|/)\.claude-plugin/plugin\.json$ ]] && version_only_bump "$f"; then
      allowlisted=$(printf '%s\n%s' "$allowlisted" "$f" | sed '/^$/d')
    else
      rest=$(printf '%s\n%s' "$rest" "$f" | sed '/^$/d')
    fi
  done <<< "$undeclared"
  undeclared="$rest"
fi

csv() { printf '%s\n' "$1" | sort -u | paste -sd, -; }

if [ -n "$allowlisted" ]; then echo "ALLOWLISTED $(csv "$allowlisted")"; fi
if [ -n "$undeclared" ]; then
  echo "UNDECLARED $(csv "$undeclared")"
  exit 2
fi
exit 0
