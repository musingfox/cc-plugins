#!/usr/bin/env bash
# Self-test for zen-agent/bin/open: an agent's lone http(s) URL goes to the
# agent Zen, everything else goes to the real open untouched. Both targets are
# stubs that record their argv; no browser starts.

set -uo pipefail

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1"; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHIM="$REPO/zen-agent/bin/open"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

for stub in real zen; do
  printf '#!/bin/sh\nprintf "%%s\\n" "%s" "$@" > "%s/called"\n' "$stub" "$TMP" > "$TMP/$stub"
  chmod +x "$TMP/$stub"
done

# run LABEL EXPECTED_STUB MARKER_ENV -- ARGS...
run() {
  local label=$1 want=$2 marker=$3; shift 4
  rm -f "$TMP/called"
  env -u AI_AGENT -u CLAUDECODE $marker \
    ZEN_AGENT_REAL_OPEN="$TMP/real" ZEN_AGENT_BIN="$TMP/zen" \
    bash "$SHIM" "$@" >/dev/null 2>&1
  local got
  got="$(cat "$TMP/called" 2>/dev/null | tr '\n' ' ')"
  local expect
  if [ "$want" = zen ]; then expect="zen open $* "; else expect="real $* "; fi
  if [ "$got" = "$expect" ]; then ok "$label"; else bad "$label: want [$expect] got [$got]"; fi
}

run "human shell keeps the default browser" real "" -- https://example.com
run "AI_AGENT routes a URL to agent Zen"    zen  "AI_AGENT=x" -- https://example.com
run "CLAUDECODE routes a URL to agent Zen"  zen  "CLAUDECODE=1" -- http://127.0.0.1:18090/a.html
run "explicit app flag is respected"        real "CLAUDECODE=1" -- -a Safari https://example.com
run "file paths pass through"               real "CLAUDECODE=1" -- /tmp/x.html
run "two URLs pass through"                 real "CLAUDECODE=1" -- https://a.test https://b.test
run "non-http scheme passes through"        real "CLAUDECODE=1" -- mailto:a@b.test

echo "---"
echo "pass: $PASS, fail: $FAIL"
[ "$FAIL" -eq 0 ]
