#!/usr/bin/env bash
# Pins the one one-line cf-pi-run.sh dispatch template that remains in cf.md: the
# foreground --gates-only form, which hands the recorded SHARD_TEST_RUNNER to
# cf-pi-run.sh byte for byte. A template that wraps the runner in single quotes
# cannot carry a runner that holds one, such as `bash -c '...'`. The template is
# run as written against a stub cf-pi-run.sh.
# The multi-line OMP launch is covered by omp-launch-form.test.sh.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CF_MD="$CF_TESTS_DIR/../commands/cf.md"
P3MD="$CF_TESTS_DIR/../docs/phase-3-implement.md"
RUNNER="bash -c 'echo \"it'\\''s green\"'"

templates="$(cat "$CF_MD" "$P3MD" | grep -E '^[[:space:]]*".*cf-pi-run\.sh.*"\)$')"
n=$(printf '%s\n' "$templates" | grep -c .)
assert_eq "1" "$n" "cf.md and phase-3-implement.md have exactly one one-line cf-pi-run.sh template"

while IFS= read -r line; do
  [ -n "$line" ] || continue
  cmd="${line#"${line%%[![:space:]]*}"}"
  cmd="${cmd#\"}"; cmd="${cmd%\")}"
  cmd="${cmd//\\\"/\"}"
  cmd="${cmd//<id>/A}"

  S="$(mktemp -d)"
  mkdir -p "$S/scripts" "$S/shards/A"
  printf '#!/bin/bash\nprintf %%s "${!#}" > "%s/got"\n' "$S" > "$S/scripts/cf-pi-run.sh"
  chmod +x "$S/scripts/cf-pi-run.sh"
  {
    printf 'SESSION=%q\n' "$S"
    printf 'SCRIPTS=%q\n' "$S/scripts"
    printf 'SHARD_TEST_RUNNER=%s\n' "$(printf '%q' "$RUNNER")"
  } > "$S/env.sh"

  SESSION="$S" SCRIPTS="$S/scripts" bash -c "$cmd" >/dev/null 2>&1
  assert_eq "$RUNNER" "$(cat "$S/got" 2>/dev/null)" "template passes the runner verbatim: ${cmd:0:70}"
  rm -rf "$S"
done <<< "$templates"
