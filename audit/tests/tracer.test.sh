#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1" >&2; exit 1; }
frontmatter() { awk 'NR == 1 && /^---$/ { f = 1; next } f && /^---$/ { exit } f' "$1"; }

a=audit/agents/tests-tracer.md

# Accepts a frontmatter on stdin only when its tools: line is exactly Read, Grep, Glob, Write.
tools_ok() {
  local t
  t="$(sed -n 's/^tools: //p')"
  [ -n "$t" ] || return 1
  [ "$(printf '%s' "$t" | tr ',' '\n' | tr -d ' ' | sort | paste -sd, -)" = 'Glob,Grep,Read,Write' ]
}

# TracerCannotRunOrEdit T2: the predicate must reject each bad input, or the test is broken.
printf 'tools: Read, Grep, Glob, Write, Bash\n' | tools_ok && fail "T2 broken predicate: accepted a Bash tool"
printf 'tools: Read, Grep, Glob, Edit, Write\n' | tools_ok && fail "T2 broken predicate: accepted an Edit tool"
printf 'name: x\nmodel: opus\n' | tools_ok && fail "T2 broken predicate: accepted a missing tools line"

frontmatter "$a" | tools_ok || fail "T1 tools must be exactly Read, Grep, Glob, Write"
grep -Fq 'The report is the only file you write' "$a" || fail "T3 the report-only sentence"

# One verdict list and one clause-line regex for the whole file.
verdicts=(guarded partly unguarded 'too loose' contradicted 'not test-guardable' retracted)
alt="$(printf '%s|' "${verdicts[@]}")"
clause_re='^- \*\*('"${alt%|}"')\*\* L[0-9]+(-[0-9]+)? "[^"]*" — '

# ClauseVerdicts T1: the grammar sits in prose, not in a fence; all seven verdicts; the example heading.
outside="$(awk '/^```/{f=!f; next} !f' "$a")"
printf '%s\n' "$outside" | grep -Fqx -- '- **<verdict>** L<start>[-<end>] "<clause>" — <evidence>' || fail "ClauseVerdicts T1 grammar line outside any fenced block"
for v in "${verdicts[@]}"; do
  grep -Fq "**$v**" "$a" || fail "ClauseVerdicts T1 verdict token $v"
done
grep -Fqx '## Report example' "$a" || fail "ClauseVerdicts T1 ## Report example heading"
for p in 'header or test name alone' 'checks the opposite' 'even when an earlier line quoted it' \
  'the line that computes' 'never makes it partly' 'Only clause lines start with'; do
  grep -Fq "$p" "$a" || fail "ClauseVerdicts T1 anchor: $p"
done
grep -Fqi 'qualifier that names a second' "$a" || fail "ClauseVerdicts T1 anchor: qualifier that names a second"

# ClauseVerdicts T2: pinned seat.
frontmatter "$a" | grep -qx 'name: tests-tracer' || fail "ClauseVerdicts T2 name"
frontmatter "$a" | grep -qx 'model: opus' || fail "ClauseVerdicts T2 model"
frontmatter "$a" | grep -qx 'effort: xhigh' || fail "ClauseVerdicts T2 effort"

# ClauseVerdicts T7: the example is the first fenced block after the heading and shows every rule.
example="$(awk '/^## Report example$/{p=1; next} p && /^```/{n++; if (n==2) exit; next} p && n==1' "$a")"
[ -n "$example" ] || fail "ClauseVerdicts example block empty"
lines="$(printf '%s\n' "$example" | grep -E '^- \*\*' || true)"
bad="$(printf '%s\n' "$lines" | grep -Evc "$clause_re" || true)"
[ "$bad" = 0 ] || fail "ClauseVerdicts example has $bad lines off grammar"
for v in "${verdicts[@]}"; do
  printf '%s\n' "$lines" | grep -Fq -- "- **$v** L" || fail "ClauseVerdicts example lacks a $v line"
done
[ -n "$(printf '%s\n' "$lines" | sed -E 's/^- \*\*[a-z -]+\*\* (L[0-9]+)(-[0-9]+)? .*/\1/' | sort | uniq -d)" ] \
  || fail "ClauseVerdicts example has no two clause lines sharing a start line"
printf '%s\n' "$lines" | grep -F -- '- **guarded**' | grep -Eq '`[^`]+`.*`[^`]+`' \
  || fail "ClauseVerdicts example has no guarded line with two quoted spans"
printf '%s\n' "$lines" | grep -E '^- \*\*(guarded|contradicted)\*\* ' | grep -vqE ' — .*[^ ]+:[0-9]+[^`]*`[^`]+`' \
  && fail "ClauseVerdicts example has a guarded or contradicted line without path:line and a quoted span"

printf '%s\n' '- **guarded** L1 "x" — see t.sh:3 asserts it' | grep -vqE ' — .*[^ ]+:[0-9]+[^`]*`[^`]+`' \
  || fail "ClauseVerdicts evidence regex accepts a guarded line with no quote"

# ClauseVerdicts T8: the agent file holds no wording from the fixtures.
for w in export overwrite dashboard '200 ms' responsive 'status line' 'attached to the PR' timeout \
  'confirmed cause' 'failing test' "caller's model"; do
  grep -Fqi -- "$w" "$a" && fail "ClauseVerdicts T8 fixture wording in the agent file: $w"
done

# CommitmentSelection T1
grep -Fq 'by what it says, not by its heading' "$a" || fail "CommitmentSelection T1 selection phrase"
for w in 'left open' 'would overturn' 'history'; do
  grep -Fq "$w" "$a" || fail "CommitmentSelection T1 names $w"
done

# NotTestGuardableClauses T1
for c in 'real-run receipt' 'action outside the repo' 'negative or process clause' 'meta clause' \
  'acceptance bookkeeping' 'its specs are accepted'; do
  grep -Fq "$c" "$a" || fail "NotTestGuardableClauses T1 names $c"
done

# RetractedClausesSetAside T1
grep -Fq 'retracted at L' "$a" || fail "RetractedClausesSetAside T1 retracted at L"

# TooLooseClauses T1
grep -Fq 'the missing specific' "$a" || fail "TooLooseClauses T1 the missing specific"
