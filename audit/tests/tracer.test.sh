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

# ClauseVerdicts T1: the grammar sits in prose, not in a fence; all six verdicts; the example heading.
outside="$(awk '/^```/{f=!f; next} !f' "$a")"
printf '%s\n' "$outside" | grep -Fqx -- '- **<verdict>** L<start>[-<end>] "<clause>" — <evidence>' || fail "ClauseVerdicts T1 grammar line outside any fenced block"
for v in guarded partly unguarded 'too loose' 'not test-guardable' retracted; do
  grep -Fq "**$v**" "$a" || fail "ClauseVerdicts T1 verdict token $v"
done
grep -Fqx '## Report example' "$a" || fail "ClauseVerdicts T1 ## Report example heading"
grep -Fq 'header or test name alone' "$a" || fail "ClauseVerdicts T1 header-or-test-name rule"

# ClauseVerdicts T2: pinned seat.
frontmatter "$a" | grep -qx 'name: tests-tracer' || fail "ClauseVerdicts T2 name"
frontmatter "$a" | grep -qx 'model: opus' || fail "ClauseVerdicts T2 model"
frontmatter "$a" | grep -qx 'effort: xhigh' || fail "ClauseVerdicts T2 effort"

# The example is the first fenced block after the heading, one line per verdict, no quote inside a clause.
example="$(awk '/^## Report example$/{p=1; next} p && /^```/{n++; if (n==2) exit; next} p && n==1' "$a")"
[ -n "$example" ] || fail "ClauseVerdicts example block empty"
for v in guarded partly unguarded 'too loose' 'not test-guardable' retracted; do
  printf '%s\n' "$example" | grep -Fq -- "- **$v** L" || fail "ClauseVerdicts example lacks a $v line"
done
printf '%s\n' "$example" | grep -E '^- \*\*' | grep -Eq '^- \*\*[a-z -]+\*\* L[0-9]+(-[0-9]+)? "[^"]*" — ' \
  || fail "ClauseVerdicts example line off grammar"
bad="$(printf '%s\n' "$example" | grep -E '^- \*\*' | grep -Evc '^- \*\*[a-z -]+\*\* L[0-9]+(-[0-9]+)? "[^"]*" — ' || true)"
[ "$bad" = 0 ] || fail "ClauseVerdicts example has $bad lines off grammar"

# CommitmentSelection T1
grep -Fq 'by what it says, not by its heading' "$a" || fail "CommitmentSelection T1 selection phrase"
for w in 'left open' 'would overturn' 'history'; do
  grep -Fq "$w" "$a" || fail "CommitmentSelection T1 names $w"
done
