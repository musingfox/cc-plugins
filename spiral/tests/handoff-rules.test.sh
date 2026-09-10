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

n=$(grep -cF '**The first and last sections must stand alone.** Once this plan is promoted (§5) they are the' "$cmd" || true)
[ "$n" -eq 1 ] || fail "stand-alone first line once, got $n"

n=$(grep -cF 'conversation", no `.spiral/` paths: those die with the run, and a criterion nobody can resolve' "$cmd" || true)
[ "$n" -eq 1 ] || fail "stand-alone conversation line once, got $n"

n=$(grep -cF '**Load-bearing facts carry their source.** Any claim the result rests on — what a component' "$cmd" || true)
[ "$n" -eq 1 ] || fail "load-bearing first line once, got $n"

n=$(grep -cF 'branch (§3), a link for anything outside it. What you cannot source goes in as an' "$cmd" || true)
[ "$n" -eq 1 ] || fail "sourcing branch line once, got $n"

n=$(grep -cF 'downstream will catch, and the layers built on it are built on nothing.' "$cmd" || true)
[ "$n" -eq 1 ] || fail "downstream line once, got $n"

n=$(grep -cF 'depends: []         # milestone slugs that must land first' "$cmd" || true)
[ "$n" -eq 1 ] || fail "depends frontmatter once, got $n"

n=$(grep -cF 'status: accepted    # accepted | done | superseded' "$cmd" || true)
[ "$n" -eq 1 ] || fail "status frontmatter once, got $n"
