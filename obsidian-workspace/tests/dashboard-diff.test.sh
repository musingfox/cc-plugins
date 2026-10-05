#!/usr/bin/env bash
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
# scripts/dashboard-diff.py: a vault dashboard (stdin) against the plugin's
# template, compared as parsed YAML so Obsidian's reformatting is no difference.

fail() { echo "  ✗ $*"; exit 1; }

script=obsidian-workspace/scripts/dashboard-diff.py
fx=obsidian-workspace/tests/fixtures/dashboards
tpl=obsidian-workspace/templates

diffdash() { uv run --quiet --no-project --with pyyaml "$script" "$@" 2>&1; }

# T1: the template as init writes it, and the same file after Obsidian reformatted it.
out=$(sed 's/__PROJECT__/demo/g' "$tpl/dashboard-project.base" | diffdash project demo)
[ "$out" = 'verdict: current' ] || fail "T1 exact template: $out"
out=$(diffdash project demo <"$fx/reformatted.base")
[ "$out" = 'verdict: current' ] || fail "T1 reformatted template: $out"
out=$(diffdash cross <"$tpl/dashboard-cross.base")
[ "$out" = 'verdict: current' ] || fail "T1 cross template: $out"

# T2: every earlier template version, taken from git, is an unedited older template.
n=0
for kind in project cross; do
  for sha in $(git log --format=%h -- "$tpl/dashboard-$kind.base" | tail -n +2); do
    want=$(git show "$sha:$tpl/dashboard-$kind.base" | sed 's/__PROJECT__/demo/g')
    args=("$kind"); [ "$kind" = project ] && args+=(demo)
    out=$(printf '%s\n' "$want" | diffdash "${args[@]}")
    first=$(printf '%s\n' "$out" | head -1)
    [ "$first" = "verdict: stale $sha" ] || fail "T2 $kind $sha: $first"
    n=$((n + 1))
  done
done
[ "$n" -ge 5 ] || fail "T2 checked $n earlier versions, want >=5"
out=$(git show "de72ecd:$tpl/dashboard-project.base" | sed 's/__PROJECT__/demo/g' | diffdash project demo)
[ "$(printf '%s\n' "$out" | head -1)" = 'verdict: stale de72ecd' ] || fail "T2 de72ecd: $out"
printf '%s\n' "$out" | grep -qF 'removed views."All Tasks"' || fail "T2 de72ecd must list the missing All Tasks view: $out"

# T3: the formula changed, the view names did not (the 0.9.10 Title link), reformatted by Obsidian.
out=$(diffdash project demo <"$fx/formula-changed.base")
[ "$(printf '%s\n' "$out" | head -1)" = 'verdict: stale 0acad88' ] || fail "T3 verdict: $out"
printf '%s\n' "$out" | grep -qF 'changed formulas.display: "if(title, title, file.name)" -> "file.asLink(if(title, title, file.name))"' || fail "T3 formula line: $out"
[ "$(printf '%s\n' "$out" | grep -c '^  ')" -eq 1 ] || fail "T3 want exactly one change line: $out"

# T4: hand edits to a formula, a field order and a filter are listed, and named as hand edits.
out=$(diffdash project demo <"$fx/hand-edited.base")
[ "$(printf '%s\n' "$out" | head -1)" = 'verdict: edited' ] || fail "T4 verdict: $out"
printf '%s\n' "$out" | grep -qx 'base: current' || fail "T4 base: $out"
for path in 'formulas.days_until_due' 'views."Active".order' 'views."Blocked".filters'; do
  printf '%s\n' "$out" | grep -qF "changed $path" || fail "T4 missing $path: $out"
done

# T5: hand-added views on an older template: hand edits against that version, changes against the current one.
out=$(diffdash project demo <"$fx/custom-view.base")
[ "$(printf '%s\n' "$out" | head -1)" = 'verdict: edited' ] || fail "T5 verdict: $out"
printf '%s\n' "$out" | grep -qx 'base: 0acad88' || fail "T5 base: $out"
hand=$(printf '%s\n' "$out" | awk '/^hand edits/{f=1;next} /^[a-z]/{f=0} f')
[ "$(printf '%s\n' "$hand" | sort | paste -sd, -)" = '  added views."Backlog",  added views."Board"' ] || fail "T5 hand edits: $hand"
changes=$(printf '%s\n' "$out" | awk '/^changes/{f=1;next} /^[a-z]/{f=0} f')
printf '%s\n' "$changes" | grep -qF 'changed formulas.display' || fail "T5 changes lack the formula: $out"
printf '%s\n' "$changes" | grep -qF 'added views."Backlog"' || fail "T5 changes must say Backlog would be dropped: $out"

# T6: the CLI's not-found line means the dashboard is missing.
out=$(printf 'Error: File "pm/demo/dashboard.base" not found.\n' | diffdash project demo)
[ "$out" = 'verdict: missing' ] || fail "T6: $out"

# T7: the template body stays out of the output: a whole view is named, never printed.
out=$(git show "de72ecd:$tpl/dashboard-project.base" | sed 's/__PROJECT__/demo/g' | diffdash project demo)
n=$(printf '%s\n' "$out" | grep -c 'blocked_by.isEmpty' || true)
[ "$n" -eq 0 ] || fail "T7 a missing view's body was printed: $out"

# T8: bad usage exits 2.
diffdash project </dev/null >/dev/null; rc=$?
[ "$rc" -eq 2 ] || fail "T8 project without a name exited $rc"
echo ok
