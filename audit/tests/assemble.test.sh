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
- **contradicted** L20 "keeps seven daily copies" — t/b.test.sh:4 asserts three copies
- **not test-guardable** L18 "one real run is attached" — real-run receipt
- **retracted** L19 "prints a status line" — retracted at L30
R
printf -- '- **unguarded** L5 "does the thing" — searched t/\n' > "$tmp/reports/beta.md"
printf 'I could not read the milestone.\n' > "$tmp/reports/psi.md"
printf 'x\n' > "$tmp/gamma-unused"

out="$(bash "$S" "$tmp/inv" "$tmp/reports")" || fail "T1 exit"
section() { printf '%s\n' "$2" | awk -v h="$1" '$0==h{p=1; next} p && /^## /{exit} p'; }

[ "$(section '## alpha (done)' "$out" | grep -c '^- \*\*')" = 7 ] || fail "T1 alpha seven lines"
diff <(section '## alpha (done)' "$out" | grep '^- \*\*') "$tmp/reports/alpha.md" >/dev/null || fail "T1 alpha verbatim"
section '## beta (accepted)' "$out" | grep -Fq 'unguarded' || fail "T1 beta section"
section '## omega (done)' "$out" | grep -Fqx 'not traced: no report' || fail "T1 omega"
section '## psi (done)' "$out" | grep -Fqx 'not traced: no clause lines in report' || fail "T1 psi"
section '## Skipped' "$out" | grep -Fqx -- '- docs/milestones/gamma.md — superseded' || fail "T1 skipped"
order="$(printf '%s\n' "$out" | grep '^## ' | paste -sd, -)"
[ "$order" = '## Counts,## Hand to cf,## alpha (done),## beta (accepted),## omega (done),## psi (done),## Skipped' ] || fail "T1 section order: $order"

out2="$(bash "$S" "$tmp/inv" "$tmp/no-such-dir")" || fail "T2 exit 0"
[ "$(printf '%s\n' "$out2" | grep -cFx 'not traced: no report')" = 4 ] || fail "T2 four not traced lines"

rc=0; err="$(bash "$S" 2>&1 >/dev/null)" || rc=$?
[ "$rc" = 1 ] || fail "T3 exit 1, got $rc"
case "$err" in 'usage: assemble.sh'*) ;; *) fail "T3 usage: $err";; esac

# VerdictCounts T1
printf '%s\n' "$out" | grep -Fqx '| milestone | guarded | partly | unguarded | too loose | contradicted | not test-guardable | retracted |' || fail "Counts header"
printf '%s\n' "$out" | grep -Fqx '| alpha | 1 | 1 | 1 | 1 | 1 | 1 | 1 |' || fail "Counts alpha row"
printf '%s\n' "$out" | grep -Fqx '| beta | 0 | 0 | 1 | 0 | 0 | 0 | 0 |' || fail "Counts beta row"
printf '%s\n' "$out" | grep -Fqx '| total | 1 | 1 | 2 | 1 | 1 | 1 | 1 |' || fail "Counts total row"
printf '%s\n' "$out" | grep -Fqx 'not traced: omega, psi' || fail "Counts not traced line"

# VerdictCounts T2: a line off the verdict set is not counted
cp "$tmp/reports/alpha.md" "$tmp/alpha.bak"
printf -- '- **maybe** L3 "x" — y\n' >> "$tmp/reports/alpha.md"
out3="$(bash "$S" "$tmp/inv" "$tmp/reports")"
printf '%s\n' "$out3" | grep -Fqx '| total | 1 | 1 | 2 | 1 | 1 | 1 | 1 |' || fail "Counts T2 total unchanged"
printf '%s\n' "$out3" | grep -Fqx 'malformed lines: 1 (alpha)' || fail "Counts T2 malformed note"
printf '%s\n' "$out" | grep -q '^malformed lines:' && fail "Counts T1 no malformed note when every line is well formed"
cp "$tmp/alpha.bak" "$tmp/reports/alpha.md"

# VerdictCounts T3 (seam): the tracer's own example report must be counted by this assembler
mkdir "$tmp/seam"
awk '/^## Report example$/{p=1; next} p && /^```/{n++; if (n==2) exit; next} p && n==1' audit/agents/tests-tracer.md | grep '^- \*\*' > "$tmp/seam/ex.md"
want_n="$(wc -l < "$tmp/seam/ex.md" | tr -d ' ')"
[ "$want_n" -ge 7 ] || fail "Counts T3 example lines extracted: $want_n"
printf 'trace\tdone\tdocs/milestones/ex.md\n' > "$tmp/seam/inv"
tot="$(bash "$S" "$tmp/seam/inv" "$tmp/seam" | grep '^| total' )"
sum="$(printf '%s' "$tot" | tr '|' '\n' | sed -n '3,$p' | tr -d ' ' | grep -E '^[0-9]+$' | paste -sd+ - | bc)"
[ "$sum" = "$want_n" ] || fail "Counts T3 total $sum != $want_n lines ($tot)"
printf '%s' "$tot" | tr '|' '\n' | sed -n '3,9p' | tr -d ' ' | while read -r c; do [ "$c" -ge 1 ] || fail "Counts T3 a verdict column is 0"; done

# CfHandoffLine T1: only the done milestone, only its partly and unguarded clauses, in report order
[ "$(printf '%s\n' "$out" | grep -c '^/cf ')" = 1 ] || fail "CfHandoff T1 exactly one /cf line"
printf '%s\n' "$out" | grep -Fqx '/cf Add tests that guard these commitments of docs/milestones/alpha.md: L14-15 "refuses to overwrite"; L16 "exits 3 on a locked file"' || fail "CfHandoff T1 line text"

# CfHandoffLine T2: nothing unguarded or partly
mkdir "$tmp/ok"
printf 'trace\tdone\tdocs/milestones/alpha.md\n' > "$tmp/ok/inv"
printf -- '- **guarded** L1 "a" — t:1 `x`\n- **retracted** L2 "b" — retracted at L9\n' > "$tmp/ok/alpha.md"
out4="$(bash "$S" "$tmp/ok/inv" "$tmp/ok")"
[ "$(printf '%s\n' "$out4" | grep -c '^/cf ')" = 0 ] || fail "CfHandoff T2 no /cf lines"
section '## Hand to cf' "$out4" | grep -Fqx 'nothing to hand to cf' || fail "CfHandoff T2 nothing line"

# CfHandoffLine T3: a | inside a clause survives the join
mkdir "$tmp/pipe"
printf 'trace\tdone\tdocs/milestones/a.md\n' > "$tmp/pipe/inv"
printf -- '- **unguarded** L3 "exits 0 | 1 on success" — searched t/\n' > "$tmp/pipe/a.md"
out6="$(bash "$S" "$tmp/pipe/inv" "$tmp/pipe")"
printf '%s\n' "$out6" | grep -Fqx '/cf Add tests that guard these commitments of docs/milestones/a.md: L3 "exits 0 | 1 on success"' \
  || fail "CfHandoff T3 a pipe inside a clause is kept"

# UnguardedList T4: a report's own headings sit below the list's, and fenced lines are untouched
mkdir "$tmp/head"
printf 'trace\tdone\tdocs/milestones/a.md\n' > "$tmp/head/inv"
cat > "$tmp/head/a.md" <<'R'
# Trace
## Counts
```
# comment
```
- **unguarded** L3 "x" — searched t/
R
out5="$(bash "$S" "$tmp/head/inv" "$tmp/head")"
[ "$(printf '%s\n' "$out5" | grep -cFx '## Counts')" = 1 ] || fail "UnguardedList T4 exactly one ## Counts"
sec="$(section '## a (done)' "$out5")"
printf '%s\n' "$sec" | grep -Fqx '### Trace' || fail "UnguardedList T4 # Trace became ###"
printf '%s\n' "$sec" | grep -Fqx '#### Counts' || fail "UnguardedList T4 ## Counts became ####"
printf '%s\n' "$sec" | grep -Fqx '# comment' || fail "UnguardedList T4 fenced line unchanged"
printf '%s\n' "$sec" | grep -Fqx -- '- **unguarded** L3 "x" — searched t/' || fail "UnguardedList T4 clause line byte for byte"
