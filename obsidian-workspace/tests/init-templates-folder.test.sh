#!/usr/bin/env bash
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
# init step 4 reads the Templates folder from .obsidian/templates.json. Run the
# skill's own line against fake vaults: a missing key is the vault root, never
# a folder named "null", and a missing file is told apart from the vault root.

fail() { echo "  ✗ $*"; exit 1; }

init=${INIT_SKILL:-obsidian-workspace/skills/init/SKILL.md}
line=$(grep -m1 -E '^ +(test -f .*&& )?TF=\$\(jq' "$init" | sed 's/^ *//')
[ -n "$line" ] || fail "T0: no TF=\$(jq …) line in $init"

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# run VAULT_JSON: prints "rc=<status> TF=<value>" for a vault whose templates.json is VAULT_JSON ("" = no file).
run() {
  local VAULT_PATH="$tmp/v$RANDOM" TF="<unset>" rc
  mkdir -p "$VAULT_PATH/.obsidian"
  [ -n "$1" ] && printf '%s\n' "$1" >"$VAULT_PATH/.obsidian/templates.json"
  eval "$line"; rc=$?
  echo "rc=$rc TF=$TF"
}

out=$(run '{"folder":"Templates"}')
[ "$out" = 'rc=0 TF=Templates' ] || fail "T1 folder set: $out"
out=$(run '{}')
[ "$out" = 'rc=0 TF=' ] || fail "T2 no folder key must mean the vault root: $out"
out=$(run '')
case "$out" in 'rc=0 TF=') fail "T3 a missing templates.json reads as the vault root: $out" ;; esac
echo ok
