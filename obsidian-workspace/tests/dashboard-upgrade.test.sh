#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

init=obsidian-workspace/skills/init/SKILL.md
step6=$(awk '/^6\. \*\*/{f=1} /^7\. \*\*/{exit} f' "$init")

n=$(printf '%s\n' "$step6" | grep -c 'hand edits' || true)
[ "$n" -ge 1 ] || fail "T1: init step 6 hand edits count is $n, want >=1"

n=$(grep -cF 'predates the Blocked / By Parent / Docs' "$init" || true)
[ "$n" -eq 0 ] || fail "T2: pre-0.9 Blocked phrase still present"
n=$(grep -cF 'Migrate a pre-0.9 project' "$init" || true)
[ "$n" -eq 0 ] || fail "T2: Migrate a pre-0.9 project still present"

n=$(printf '%s\n' "$step6" | grep -cF 'Legacy `archive/`' || true)
[ "$n" -eq 1 ] || fail "T3: Legacy archive count is $n, want 1"
n=$(printf '%s\n' "$step6" | grep -cF 'pre-0.9 notes have no `title` property' || true)
[ "$n" -eq 1 ] || fail "T3: Missing title bullet wording changed, count $n, want 1"
n=$(grep '^description:' "$init" | grep -cF 'migrate my obw vault' || true)
[ "$n" -eq 1 ] || fail "T3: init description lost the migrate my obw vault trigger"
n=$(printf '%s\n' "$step6" | grep -cF 'read path="pm/<PROJECT_NAME>/dashboard.base"' || true)
[ "$n" -eq 1 ] || fail "T1: init step 6 literal read path count is $n, want 1"
n=$(printf '%s\n' "$step6" | grep -cF 'Missing `title`' || true)
[ "$n" -eq 1 ] || fail "T3: Missing title count is $n, want 1"
