#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

cmd=spiral/commands/spiral.md

n=$(grep -cF '**Never duplicate what a durable artifact already records.**' "$cmd" || true)
[ "$n" -eq 1 ] || fail "T1: Never duplicate heading once, got $n"

n=$(grep -cF 'by path, URL, or commit' "$cmd" || true)
[ "$n" -eq 1 ] || fail "T2: by path, URL, or commit once, got $n"

n=$(grep -cF '`.spiral/` and the conversation are not durable' "$cmd" || true)
[ "$n" -eq 1 ] || fail "T3: .spiral/ and conversation not durable once, got $n"

n=$(grep -cF 'spec, plan, ADR,' "$cmd" || true)
[ "$n" -eq 1 ] || fail "T4: spec, plan, ADR, once, got $n"
