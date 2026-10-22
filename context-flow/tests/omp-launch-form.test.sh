#!/usr/bin/env bash
# Runs the OMP launch command exactly as cf.md §3.6 writes it, against stub
# shards: one background Bash returns only after every shard finished, exits 0,
# and each shard's own output lands in its run.out.
# NO set -e

: "${CF_TESTS_DIR:=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
. "$CF_TESTS_DIR/lib/assert.sh"

CFMD="$CF_TESTS_DIR/../docs/phase-3-implement.md"
s36=$(awk '/^### 3\.6/ {p=1; next} p && /^## / {exit} p' "$CFMD")
fenced=$(printf '%s\n' "$s36" | awk '/^```/ {f=!f; next} f')

# Strip the Bash(...) wrapper, the two-space indent, the \" escapes and the
# placeholder line; what remains is the command the Bash tool runs.
body=$(printf '%s\n' "$fenced" | sed -n '/^Bash(run_in_background: true/,/exit 0")$/p' \
  | sed -e '/^Bash(/d' -e '/one line per READY id/d' -e 's/^  //' -e 's/\\"/"/g' \
        -e 's/^"//' -e 's/")$//')

FLOW="$(mktemp -d)"
STUBS="$FLOW/stubs"
mkdir -p "$STUBS" "$FLOW/shards/A" "$FLOW/shards/B"
# A runner that holds a single quote, the case a quoting slip would corrupt.
RUNNER="bash -c 'echo \"it'\\''s green\"'"
{
  printf 'SCRIPTS=%q\n' "$STUBS"
  printf 'SHARD_TEST_RUNNER=%s\n' "$(printf '%q' "$RUNNER")"
} > "$FLOW/env.sh"
cat > "$STUBS/cf-pi-run.sh" <<STUB
#!/bin/bash
printf '%s %s\n' "\$1" "\$4" >> "$FLOW/calls"
case "\$(basename "\$1")" in
  A) echo 'A ran'; printf '## Status\nPASS\n' > "\$1/outcome.md" ;;
  B) sleep 1; echo 'B ran'; printf '## Status\nFAIL\n' > "\$1/outcome.md"; exit 2 ;;
esac
STUB
chmod +x "$STUBS/cf-pi-run.sh"

out=$(env -u SCRIPTS -u SHARD_TEST_RUNNER SESSION="$FLOW" bash -c "$body" 2>"$FLOW/err")
rc=$?

# T3
assert_eq "0" "$rc" "T3 command exit status"
assert_eq "" "$out" "T3 command stdout empty"
assert_eq "" "$(cat "$FLOW/err")" "T3 command stderr empty"
assert_eq "present" "$([ -s "$FLOW/shards/A/outcome.md" ] && [ -s "$FLOW/shards/B/outcome.md" ] && echo present || echo absent)" \
  "T3 both outcomes written on return"
assert_eq "A ran" "$(cat "$FLOW/shards/A/run.out")" "T3 A run.out"
assert_eq "B ran" "$(cat "$FLOW/shards/B/run.out")" "T3 B run.out"

# T4
assert_eq "1" "$(grep -cxF "$FLOW/shards/A $RUNNER" "$FLOW/calls")" \
  "T4 A got its shard path and the runner from env.sh byte for byte"
assert_eq "1" "$(grep -cxF "$FLOW/shards/B $RUNNER" "$FLOW/calls")" \
  "T4 B got its shard path and the runner from env.sh byte for byte"

# T10
calls_before=$(wc -l < "$FLOW/calls")
FLOW2="$(mktemp -d)"
mkdir -p "$FLOW2/shards/A" "$FLOW2/shards/B"
out2=$(env -u SHARD_TEST_RUNNER SCRIPTS="$STUBS" SESSION="$FLOW2" bash -c "$body" 2>"$FLOW2/err")
rc2=$?
assert_eq "1" "$rc2" "T10 a missing env.sh fails the launch command"
assert_eq "$calls_before" "$(wc -l < "$FLOW/calls")" "T10 no shard starts when env.sh is missing"
assert_eq "absent" "$([ -e "$FLOW2/shards/A/run.out" ] || [ -e "$FLOW2/shards/B/run.out" ] && echo present || echo absent)" \
  "T10 neither shard writes run.out"
rm -rf "$FLOW2"

# T13
assert_eq "0" "$(grep -cE 'launch[.]sh' "$0" || true)" "launch-form test holds no dead launch-script line"

rm -rf "$FLOW"
