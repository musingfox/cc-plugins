#!/usr/bin/env bash
# Pins the one-line cf-pi-run.sh dispatch templates that remain in cf.md (the
# foreground and background --gates-only forms): each hands the recorded
# SHARD_TEST_RUNNER to cf-pi-run.sh byte for byte. A template that wraps the
# runner in single quotes cannot carry a runner that holds one, such as
# `bash -c '...'`. Each template is run as written against a stub cf-pi-run.sh.
# The multi-line OMP launch is covered by omp-launch-form.test.sh.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CF_MD="$CF_TESTS_DIR/../commands/cf.md"
RUNNER="bash -c 'echo \"it'\\''s green\"'"

templates="$(grep -E '^[[:space:]]*".*cf-pi-run\.sh.*"\)$' "$CF_MD")"
n=$(printf '%s\n' "$templates" | grep -c .)
if [ "$n" -ge 1 ]; then assert_eq "ge1" "ge1" "cf.md has at least one one-line cf-pi-run.sh template"
else assert_eq ">=1" "$n" "cf.md has at least one one-line cf-pi-run.sh template"; fi

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
