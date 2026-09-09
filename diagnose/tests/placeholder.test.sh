#!/usr/bin/env bash
# Placeholder guard: no heredoc under diagnose/ may use a bare delimiter.
cd "$(git rev-parse --show-toplevel)"

# A bare delimiter would expand ${CLAUDE_PLUGIN_ROOT} away before the file is
# ever written. Bash accepts whitespace between the operator and the word, so
# the class spans that gap too. Every angle bracket below sits in its own
# single-quoted one-character fragment, so this file holds no substring its own
# pattern could match at any class width -- widening the class can never turn
# the guard on itself.

fail() { echo "  ✗ $1"; exit 1; }

lt="$(printf '%s' '<')"
pat="$(printf '%s%s%s' "$lt" "$lt" '-?[[:space:]]*[A-Za-z_]')"

count="$(grep -rnE "$pat" diagnose/ | wc -l | tr -d ' ')"
[ "$count" = 0 ] || fail "T1 bare heredoc delimiter under diagnose/: $count"

fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT
for gap in '' ' ' '	' '-'; do
  {
    printf '%s%s%s%s\n' "$lt" "$lt" "$gap" 'EOF'
    printf '%s\n' '${CLAUDE_PLUGIN_ROOT}'
    printf '%s\n' 'EOF'
  } > "$fixture/bare.sh"
  hits="$(grep -cE "$pat" "$fixture/bare.sh" || true)"
  [ "$hits" != 0 ] || fail "T2 pattern failed to flag a bare delimiter gap [$gap]"
done

{
  printf '%s%s%s\n' "$lt" "$lt" "$(printf '%s' "'")EOF$(printf '%s' "'")"
  printf '%s\n' '${CLAUDE_PLUGIN_ROOT}'
  printf '%s\n' 'EOF'
} > "$fixture/quoted.sh"
quoted="$(grep -cE "$pat" "$fixture/quoted.sh" || true)"
[ "$quoted" = 0 ] || fail "T3 pattern flagged a correctly quoted delimiter"

dbl="$(printf '%s%s' "$lt" "$lt")"
self="$(grep -cF "$dbl" diagnose/tests/placeholder.test.sh || true)"
[ "$self" = 0 ] || fail "T4 guard file holds a literal doubled angle bracket: $self"

echo "ok - placeholder.test.sh"
