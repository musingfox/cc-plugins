#!/usr/bin/env bash
# Library: sourced by other cf-pi scripts. Not directly executable.
#
# load_cf_pi_env SESSION
#   Sources $SESSION/env.sh and rebuilds PI_ARGS array from PI_PROVIDER/PI_MODEL.
#   After return: env vars from env.sh are in scope, and PI_ARGS is set
#   (empty when neither provider nor model is overridden).

load_cf_pi_env() {
  local session="$1"
  if [ -z "$session" ] || [ ! -f "$session/env.sh" ]; then
    echo "load_cf_pi_env: missing or invalid session ($session)" >&2
    return 1
  fi
  # shellcheck disable=SC1090,SC1091
  . "$session/env.sh"
  PI_ARGS=()
  [ -n "${PI_PROVIDER:-}" ] && PI_ARGS+=(--provider "$PI_PROVIDER")
  [ -n "${PI_MODEL:-}" ] && PI_ARGS+=(--model "$PI_MODEL")
  # Final `return 0` matters: without it, the last `&& append` short-circuits
  # when PI_MODEL is empty (default), function returns 1, and any caller
  # running `set -e` exits silently before its own work begins.
  return 0
}
