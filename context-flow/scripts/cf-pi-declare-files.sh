#!/usr/bin/env bash
# Declare files on a contract after the human approves a review finding that
# asks the builder to create or delete them. Without this the scope gate charges
# the approved change as undeclared_file_touched and replans the whole shard.
# Goes through the partial-replan path (cf-pi-merge-revision.sh, then
# cf-pi-shard.sh) so shards.json stays derived from contracts.json.
#
# Usage:   cf-pi-declare-files.sh FLOW_SESSION CONTRACT FILE [FILE ...]
# Stdout:  DECLARED <contract> <file> shard-<id>, one line per file
# Exit:    0 declared, 2 usage, 4 jq missing, 5 CONTRACT not in contracts.json
#          (nothing changed); any other code is cf-pi-merge-revision.sh's or
#          cf-pi-shard.sh's

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -lt 3 ]; then
  echo "Usage: cf-pi-declare-files.sh FLOW_SESSION CONTRACT FILE [FILE ...]" >&2
  exit 2
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "cf-pi-declare-files.sh: jq is required" >&2
  exit 4
fi

flow_session="$1"; contract="$2"; shift 2
load_cf_flow_env "$flow_session"

if ! jq -e --arg c "$contract" 'any(.contracts[]; .name == $c)' "$CONTRACTS_FILE" >/dev/null 2>&1; then
  echo "cf-pi-declare-files.sh: contract $contract is not in $CONTRACTS_FILE" >&2
  exit 5
fi

revision="$flow_session/contracts-revision-declare-$(date +%s).json"
jq --arg c "$contract" \
  '{schema_version, contracts: [.contracts[] | select(.name == $c)
     | .touches_files = ((.touches_files // []) + $ARGS.positional | unique)]}' \
  --args "$@" < "$CONTRACTS_FILE" > "$revision"

"$SCRIPT_DIR/cf-pi-merge-revision.sh" "$flow_session" "$revision" >/dev/null
"$SCRIPT_DIR/cf-pi-shard.sh" "$flow_session" >/dev/null

sid=$(jq -r --arg c "$contract" '.groups | to_entries[] | select(.value.contracts | index($c)) | .key' "$SHARDS_FILE")
for f in "$@"; do
  echo "DECLARED $contract $f shard-$sid"
done
