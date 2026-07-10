#!/usr/bin/env bash
# Pre-dispatch quota gate: is the configured OMP provider near saturation?
#
# A dispatch that starts on the last of a provider's quota can die mid-build,
# leaving a half-finished worktree — worse than never starting. This is the
# PROACTIVE check; cf-pi-run.sh's poll is the reactive net for real exhaustion.
#
# Only meaningful when PI_PROVIDER is set (design decision): with no provider
# pinned, OMP picks per its own default and we can't know whose quota binds, so
# we skip and let the dispatch proceed unguarded.
#
# Usage:  cf-pi-usage-check.sh [SESSION]   (SESSION's env.sh supplies PI_PROVIDER,
#         PI_USAGE_CEILING when they aren't already exported in the environment)
# Stdout: one line — OK [skip-<why>] | SATURATED <provider> <pct>
# Exit:   always 0 (advisory; main reads the line and routes). Fail-open: any
#         omp/parse error -> OK, since the reactive net still catches true
#         exhaustion and blocking dispatch on a flaky check is worse.
#
# Test seam: set CF_USAGE_JSON=<file> to feed a fixture instead of calling omp.

set -uo pipefail

# env.sh writes PI_PROVIDER/PI_USAGE_CEILING as plain (unexported) vars, so a
# standalone `bash cf-pi-usage-check.sh` from main won't see them — source the
# session env here, exactly as the other cf-pi-*.sh scripts self-load.
if [ -n "${1:-}" ] && [ -f "$1/env.sh" ]; then
  # shellcheck source=/dev/null
  . "$1/env.sh"
fi

provider="${PI_PROVIDER:-}"
ceiling="${PI_USAGE_CEILING:-0.85}"

[ -z "$provider" ] && { echo "OK skip-no-provider"; exit 0; }

if [ -n "${CF_USAGE_JSON:-}" ]; then
  json="$(cat "$CF_USAGE_JSON" 2>/dev/null || true)"
else
  command -v omp >/dev/null 2>&1 || { echo "OK skip-no-omp"; exit 0; }
  json="$(omp usage --json 2>/dev/null || true)"
fi
[ -z "$json" ] && { echo "OK skip-nodata"; exit 0; }

# Balancing-aware aggregate: OMP load-balances across a provider's accounts, so
# it can still dispatch as long as ONE account has headroom. Per account, the
# most-used window binds (max over windows; limitReached counts as fully used).
# Provider usage = the BEST account's binding usage (min over accounts). With a
# single account this reduces to "that account's most-used window".
# ponytail: min-over-accounts of max-over-windows is the correct balancing rule;
# no need to model per-request token accounting the reactive poll already covers.
usage=$(printf '%s' "$json" | jq -r --arg p "$provider" '
  [ .reports[]
    | select(.provider | test($p; "i"))
    | (if .metadata.limitReached then 1.0
       else ([.limits[].amount.usedFraction] | max // 0) end) ]
  | min // -1' 2>/dev/null || echo -1)

# No matched provider / bad parse -> fail-open.
awk -v u="$usage" -v c="$ceiling" -v p="$provider" 'BEGIN{
  if (u < 0)      { print "OK skip-unmatched"; exit }
  if (u >= c)     { printf "SATURATED %s %d%%\n", p, (u*100)+0.5; exit }
  print "OK"
}'
