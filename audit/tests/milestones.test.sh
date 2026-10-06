#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

S="$PWD/audit/scripts/milestones.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/r/docs/milestones/alpha"
m="$tmp/r/docs/milestones"
printf -- '---\nstatus: done   # accepted | done | superseded\n---\nbody\n' > "$m/alpha.md"
printf '# scoring key only\n' > "$m/alpha.scoring-key.md"
printf -- '---\nstatus: accepted\n---\nstatus: superseded\n' > "$m/beta.md"
printf -- '---\nstatus: abandoned\n---\n' > "$m/delta.md"
printf -- '---\ndelivered: x\n---\n' > "$m/epsilon.md"
printf -- '---\nstatus: superseded\n---\n' > "$m/gamma.md"
printf -- '---\nstatus: "Done"\n---\n' > "$m/zeta.md"
printf -- '---\nstatus: done\n---\n' > "$m/alpha/tuning.md"
printf 'x\n' > "$m/notes.txt"

want="$(printf 'trace\tdone\tdocs/milestones/alpha.md\nskip\tno-frontmatter\tdocs/milestones/alpha.scoring-key.md\ntrace\taccepted\tdocs/milestones/beta.md\nskip\tabandoned\tdocs/milestones/delta.md\ntrace\tunset\tdocs/milestones/epsilon.md\nskip\tsuperseded\tdocs/milestones/gamma.md\ntrace\tdone\tdocs/milestones/zeta.md')"
got="$(bash "$S" "$tmp/r")" || fail "T1 exit"
[ "$got" = "$want" ] || fail "T1 inventory: got
$got"

mkdir -p "$tmp/e/docs/milestones"
out="$(bash "$S" "$tmp/e")" || fail "T2 exit must be 0"
[ -z "$out" ] || fail "T2 stdout must be empty"

err="$(bash "$S" 2>&1 >/dev/null)" && fail "T3 no argument must exit non-zero"
rc=0; bash "$S" >/dev/null 2>&1 || rc=$?
[ "$rc" = 1 ] || fail "T3 exit 1, got $rc"
case "$err" in 'usage: milestones.sh'*) ;; *) fail "T3 usage message: $err";; esac
