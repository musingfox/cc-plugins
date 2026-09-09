#!/usr/bin/env bash
# Ported files name the author, the licence, and the exact upstream commit.
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $1"; exit 1; }

lic=diagnose/docs/LICENSE-upstream
[ "$(grep -c 'Copyright (c) 2026 Matt Pocock' "$lic")" = 1 ] || fail "T1 copyright"
[ "$(grep -c 'MIT License' "$lic")" = 1 ] || fail "T2 MIT License"

hdr=$(head -8 diagnose/scripts/hitl-loop.template.sh)
echo "$hdr" | grep -q '321658273cb1d20b76026717d027d505790106d4' || fail "T3 commit sha"
echo "$hdr" | grep -q 'skills/engineering/diagnosing-bugs/scripts/hitl-loop.template.sh' || fail "T4 upstream path"
echo "$hdr" | grep -q 'https://github.com/mattpocock/skills' || fail "T5 upstream url"

# grep -c over the head -8 pipe, matching the contract's given
[ "$(head -8 diagnose/scripts/hitl-loop.template.sh | grep -c '321658273cb1d20b76026717d027d505790106d4')" = 1 ] || fail "T3 count"
[ "$(head -8 diagnose/scripts/hitl-loop.template.sh | grep -c 'skills/engineering/diagnosing-bugs/scripts/hitl-loop.template.sh')" = 1 ] || fail "T4 count"
[ "$(head -8 diagnose/scripts/hitl-loop.template.sh | grep -c 'https://github.com/mattpocock/skills')" = 1 ] || fail "T5 count"

echo "ok - attribution.test.sh"
