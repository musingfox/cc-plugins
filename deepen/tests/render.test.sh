#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

src="$PWD/deepen/scripts/render-survey.sh"
[ -f "$src" ] || fail "render-survey.sh missing"

setup() {
  T="$(mktemp -d)"
  mkdir -p "$T/mp/deepen/scripts"
  cp "$src" "$T/mp/deepen/scripts/render-survey.sh"
  printf '%s\n' '# hello' > "$T/r.md"
  script="$T/mp/deepen/scripts/render-survey.sh"
}

teardown() { rm -rf "$T"; }

run_render() {
  set +e
  out="$(CLAUDE_PLUGIN_ROOT="$T/mp/deepen" bash "$script" "$@" 2>"$T/err")"
  rc=$?
  set -e
  err="$(cat "$T/err")"
}

# T1: viz sibling stub is invoked with default output name
setup
mkdir -p "$T/mp/viz/lib"
printf '%s\n' '#!/bin/bash' 'echo "STUB-RENDER $1 $2"' 'exit 0' > "$T/mp/viz/lib/render.sh"
chmod +x "$T/mp/viz/lib/render.sh"
run_render "$T/r.md"
printf '%s\n' "$out" | grep -q "STUB-RENDER $T/r.md deepen-survey" || fail "T1: stdout must contain STUB-RENDER with report and deepen-survey"
[ "$(printf '%s\n' "$out" | tail -n 1)" = '[deepen] render=viz' ] || fail "T1: last line must be [deepen] render=viz"
[ "$rc" -eq 0 ] || fail "T1: exit code must be 0, got $rc"
teardown

# T2: highest versioned viz sibling wins
setup
mkdir -p "$T/mp/viz/0.1.0/lib" "$T/mp/viz/0.2.0/lib"
printf '%s\n' '#!/bin/bash' 'echo OLD' 'exit 0' > "$T/mp/viz/0.1.0/lib/render.sh"
printf '%s\n' '#!/bin/bash' 'echo NEW' 'exit 0' > "$T/mp/viz/0.2.0/lib/render.sh"
run_render "$T/r.md"
printf '%s\n' "$out" | grep -q 'NEW' || fail "T2: stdout must contain NEW"
printf '%s\n' "$out" | grep -q 'OLD' && fail "T2: stdout must not contain OLD"
[ "$rc" -eq 0 ] || fail "T2: exit code must be 0, got $rc"
teardown

# T3: no viz sibling → inline markdown
setup
run_render "$T/r.md"
printf '%s\n' "$out" | grep -q '# hello' || fail "T3: stdout must contain # hello"
[ "$(printf '%s\n' "$out" | tail -n 1)" = '[deepen] render=inline' ] || fail "T3: last line must be [deepen] render=inline"
[ "$err" = "[deepen] viz render.sh not found — report at: $T/r.md" ] || fail "T3: stderr must be the not-found line, got '$err'"
[ "$rc" -eq 0 ] || fail "T3: exit code must be 0, got $rc"
teardown

# T4: viz stub failure falls back to inline
setup
mkdir -p "$T/mp/viz/lib"
printf '%s\n' '#!/bin/bash' 'exit 1' > "$T/mp/viz/lib/render.sh"
chmod +x "$T/mp/viz/lib/render.sh"
run_render "$T/r.md"
[ "$(printf '%s\n' "$out" | tail -n 1)" = '[deepen] render=inline' ] || fail "T4: last line must be [deepen] render=inline"
[ "$err" = "[deepen] viz render failed — report at: $T/r.md" ] || fail "T4: stderr must be the render-failed line, got '$err'"
[ "$rc" -eq 0 ] || fail "T4: exit code must be 0, got $rc"
teardown

# T5: missing report
setup
run_render "$T/missing.md"
[ "$rc" -eq 1 ] || fail "T5: exit code must be 1, got $rc"
printf '%s\n' "$err" | grep -q 'report not found' || fail "T5: stderr must contain report not found"
teardown

# T6: explicit output name is passed through
setup
mkdir -p "$T/mp/viz/lib"
printf '%s\n' '#!/bin/bash' 'echo "STUB-RENDER $1 $2"' 'exit 0' > "$T/mp/viz/lib/render.sh"
chmod +x "$T/mp/viz/lib/render.sh"
run_render "$T/r.md" 'survey-x'
printf '%s\n' "$out" | grep -q "STUB-RENDER $T/r.md survey-x" || fail "T6: stub must receive survey-x as \$2"
[ "$rc" -eq 0 ] || fail "T6: exit code must be 0, got $rc"
teardown

# T7: a relative report path is reported absolute
setup
set +e
err="$(cd "$T" && CLAUDE_PLUGIN_ROOT="$T/mp/deepen" bash "$script" r.md 2>&1 >/dev/null)"
rc=$?
set -e
[ "$rc" -eq 0 ] || fail "T7: exit code must be 0, got $rc"
[ "$err" = "[deepen] viz render.sh not found — report at: $T/r.md" ] || fail "T7: relative path must be absolutised, got '$err'"
teardown
