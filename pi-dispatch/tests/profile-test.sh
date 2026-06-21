#!/usr/bin/env bash
# profile-test.sh — committed behavior test for pi-dispatch.sh --profile / PI_PROFILE
# resolution. Pure-local, NO pi, NO network: uses the PI_RESOLVE_PROFILE_ONLY seam,
# which resolves PROVIDER/MODEL and exits before launching pi.
#
# Returns 0 iff every assertion holds.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DISPATCH="$SCRIPT_DIR/../scripts/pi-dispatch.sh"

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "ok   - $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL - $1 (got: $2)"; }

# A temp profiles file so the test is independent of the shipped profiles.conf.
PF="$(mktemp)"
cat > "$PF" <<'EOF'
# comment line, ignored
fast     google     gemini-2.5-flash-lite
careful  anthropic  claude-sonnet-4-6
EOF
export PI_PROFILES_FILE="$PF"
export PI_RESOLVE_PROFILE_ONLY=1

# 1. --profile flag resolves provider+model from the file.
got="$(PI_PROFILE= bash "$DISPATCH" --profile careful 2>/dev/null)"
[ "$got" = "PROVIDER=anthropic MODEL=claude-sonnet-4-6" ] \
  && ok "--profile careful resolves anthropic/claude-sonnet-4-6" \
  || bad "--profile careful" "$got"

# 2. PI_PROFILE env resolves the same way (no flag).
got="$(PI_PROFILE=fast bash "$DISPATCH" dummy-brief 2>/dev/null)"
[ "$got" = "PROVIDER=google MODEL=gemini-2.5-flash-lite" ] \
  && ok "PI_PROFILE=fast resolves google/gemini-2.5-flash-lite" \
  || bad "PI_PROFILE=fast" "$got"

# 3. Explicit PI_PROVIDER/PI_MODEL override the profile.
got="$(PI_PROFILE=careful PI_PROVIDER=openai PI_MODEL=gpt-x bash "$DISPATCH" --profile careful 2>/dev/null)"
[ "$got" = "PROVIDER=openai MODEL=gpt-x" ] \
  && ok "explicit env overrides the profile" \
  || bad "env override" "$got"

# 4. Unknown profile falls through to the built-in default (warns on stderr).
got="$(PI_PROFILE=nope bash "$DISPATCH" dummy 2>/dev/null)"
[ "$got" = "PROVIDER=google MODEL=gemini-2.5-flash-lite" ] \
  && ok "unknown profile falls through to default" \
  || bad "unknown profile" "$got"

# 5. No profile at all: built-in default.
got="$(PI_PROFILE= bash "$DISPATCH" dummy 2>/dev/null)"
[ "$got" = "PROVIDER=google MODEL=gemini-2.5-flash-lite" ] \
  && ok "no profile uses built-in default" \
  || bad "no profile" "$got"

rm -f "$PF"
echo "---"
echo "pass: $PASS, fail: $FAIL"
[ "$FAIL" -eq 0 ]
