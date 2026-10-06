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
