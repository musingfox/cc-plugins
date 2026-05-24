#!/usr/bin/env bash
# Apply a contracts-revision-<n>.json into contracts.json via jq replace-by-name.
# Validates schema_version match; refuses on mismatch.
#
# Usage:   cf-pi-merge-revision.sh FLOW_SESSION REVISION_FILE
# Effects: in-place update of $FLOW_SESSION/contracts.json
#          previous version archived to contracts-prev-<timestamp>.json
# Exit:    0 on success
#          2 usage error
#          3 schema_version mismatch
#          4 jq missing
#          5 revision contains contract not in base (use new full plan instead)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=cf-pi-env.sh
. "$SCRIPT_DIR/cf-pi-env.sh"

if [ $# -ne 2 ]; then
  echo "Usage: cf-pi-merge-revision.sh FLOW_SESSION REVISION_FILE" >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "cf-pi-merge-revision.sh: jq is required but not installed" >&2
  exit 4
fi

flow_session="$1"
revision_file="$2"

load_cf_flow_env "$flow_session"

if [ ! -f "$CONTRACTS_FILE" ]; then
  echo "cf-pi-merge-revision.sh: base contracts.json not found: $CONTRACTS_FILE" >&2
  exit 2
fi
if [ ! -f "$revision_file" ]; then
  echo "cf-pi-merge-revision.sh: revision file not found: $revision_file" >&2
  exit 2
fi

base_version=$(jq -r '.schema_version // empty' "$CONTRACTS_FILE")
rev_version=$(jq -r '.schema_version // empty' "$revision_file")
if [ -z "$base_version" ] || [ -z "$rev_version" ]; then
  echo "cf-pi-merge-revision.sh: schema_version missing in base or revision" >&2
  exit 3
fi
if [ "$base_version" != "$rev_version" ]; then
  echo "cf-pi-merge-revision.sh: schema_version mismatch (base=$base_version revision=$rev_version)" >&2
  exit 3
fi

# Verify every revision contract exists in base. Partial-replan must not introduce
# new contracts -- those go through a full re-plan path.
rev_names=$(jq -r '.contracts[].name' "$revision_file")
base_names=$(jq -r '.contracts[].name' "$CONTRACTS_FILE")
missing=""
while IFS= read -r n; do
  [ -z "$n" ] && continue
  if ! grep -Fxq -- "$n" <<< "$base_names"; then
    missing+="$n\n"
  fi
done <<< "$rev_names"
if [ -n "$missing" ]; then
  echo "cf-pi-merge-revision.sh: revision contains contracts not in base (use full re-plan):" >&2
  printf "$missing" >&2
  exit 5
fi

# Archive previous version.
ts=$(date +%s)
archive="$flow_session/contracts-prev-${ts}.json"
cp "$CONTRACTS_FILE" "$archive"

# Apply revision: replace contracts whose name is in revision; keep others.
tmp=$(mktemp)
jq --slurpfile rev "$revision_file" '
  .contracts |= (
    map(
      . as $c | (
        ($rev[0].contracts | map(select(.name == $c.name)) | first)
        // $c
      )
    )
  )
' "$CONTRACTS_FILE" > "$tmp"

mv "$tmp" "$CONTRACTS_FILE"

count=$(jq -r '.contracts | length' "$revision_file")
echo "merged $count contract(s); previous archived to $archive"
