#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }

S="$PWD/audit/scripts/assemble.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

printf 'trace\tdone\tdocs/milestones/alpha.md\ntrace\taccepted\tdocs/milestones/beta.md\nskip\tsuperseded\tdocs/milestones/gamma.md\ntrace\tdone\tdocs/milestones/omega.md\ntrace\tdone\tdocs/milestones/psi.md\n' > "$tmp/inv"
mkdir "$tmp/reports"
cat > "$tmp/reports/alpha.md" <<'R'
- **guarded** L11 "writes the file" — t/a.test.sh:3 `test -f out`
- **partly** L14-15 "refuses to overwrite" — t/a.test.sh:5 checks the exit code only
- **unguarded** L16 "exits 3 on a locked file" — searched t/
- **too loose** L17 "feels fast" — the missing specific: a time
- **not test-guardable** L18 "one real run is attached" — real-run receipt
- **retracted** L19 "prints a status line" — retracted at L30
R
printf -- '- **unguarded** L5 "does the thing" — searched t/\n' > "$tmp/reports/beta.md"
printf 'I could not read the milestone.\n' > "$tmp/reports/psi.md"
printf 'x\n' > "$tmp/gamma-unused"

out="$(bash "$S" "$tmp/inv" "$tmp/reports")" || fail "T1 exit"
section() { printf '%s\n' "$out" | awk -v h="$1" '$0==h{p=1; next} p && /^## /{exit} p'; }

[ "$(section '## alpha (done)' | grep -c '^- \*\*')" = 6 ] || fail "T1 alpha six lines"
diff <(section '## alpha (done)' | grep '^- \*\*') "$tmp/reports/alpha.md" >/dev/null || fail "T1 alpha verbatim"
section '## beta (accepted)' | grep -Fq 'unguarded' || fail "T1 beta section"
section '## omega (done)' | grep -Fqx 'not traced: no report' || fail "T1 omega"
section '## psi (done)' | grep -Fqx 'not traced: no clause lines in report' || fail "T1 psi"
section '## Skipped' | grep -Fqx -- '- docs/milestones/gamma.md — superseded' || fail "T1 skipped"
order="$(printf '%s\n' "$out" | grep '^## ' | paste -sd, -)"
[ "$order" = '## Counts,## Hand to cf,## alpha (done),## beta (accepted),## omega (done),## psi (done),## Skipped' ] || fail "T1 section order: $order"

out2="$(bash "$S" "$tmp/inv" "$tmp/no-such-dir")" || fail "T2 exit 0"
[ "$(printf '%s\n' "$out2" | grep -cFx 'not traced: no report')" = 4 ] || fail "T2 four not traced lines"

rc=0; err="$(bash "$S" 2>&1 >/dev/null)" || rc=$?
[ "$rc" = 1 ] || fail "T3 exit 1, got $rc"
case "$err" in 'usage: assemble.sh'*) ;; *) fail "T3 usage: $err";; esac

# VerdictCounts T1
printf '%s\n' "$out" | grep -Fqx '| milestone | guarded | partly | unguarded | too loose | not test-guardable | retracted |' || fail "Counts header"
printf '%s\n' "$out" | grep -Fqx '| alpha | 1 | 1 | 1 | 1 | 1 | 1 |' || fail "Counts alpha row"
printf '%s\n' "$out" | grep -Fqx '| beta | 0 | 0 | 1 | 0 | 0 | 0 |' || fail "Counts beta row"
printf '%s\n' "$out" | grep -Fqx '| total | 1 | 1 | 2 | 1 | 1 | 1 |' || fail "Counts total row"
printf '%s\n' "$out" | grep -Fqx 'not traced: omega, psi' || fail "Counts not traced line"

# VerdictCounts T2: a line off the verdict set is not counted
cp "$tmp/reports/alpha.md" "$tmp/alpha.bak"
printf -- '- **maybe** L3 "x" — y\n' >> "$tmp/reports/alpha.md"
out3="$(bash "$S" "$tmp/inv" "$tmp/reports")"
printf '%s\n' "$out3" | grep -Fqx '| total | 1 | 1 | 2 | 1 | 1 | 1 |' || fail "Counts T2 total unchanged"
cp "$tmp/alpha.bak" "$tmp/reports/alpha.md"

# VerdictCounts T3 (seam): the tracer's own example report must be counted by this assembler
mkdir "$tmp/seam"
awk '/^## Report example$/{p=1; next} p && /^```/{n++; if (n==2) exit; next} p && n==1' audit/agents/tests-tracer.md | grep '^- \*\*' > "$tmp/seam/ex.md"
want_n="$(wc -l < "$tmp/seam/ex.md" | tr -d ' ')"
[ "$want_n" -ge 6 ] || fail "Counts T3 example lines extracted: $want_n"
printf 'trace\tdone\tdocs/milestones/ex.md\n' > "$tmp/seam/inv"
tot="$(bash "$S" "$tmp/seam/inv" "$tmp/seam" | grep '^| total' )"
sum="$(printf '%s' "$tot" | tr '|' '\n' | sed -n '3,$p' | tr -d ' ' | grep -E '^[0-9]+$' | paste -sd+ - | bc)"
[ "$sum" = "$want_n" ] || fail "Counts T3 total $sum != $want_n lines ($tot)"
printf '%s' "$tot" | tr '|' '\n' | sed -n '3,8p' | tr -d ' ' | while read -r c; do [ "$c" -ge 1 ] || fail "Counts T3 a verdict column is 0"; done
