#!/usr/bin/env bash
# pi-agent.sh — the UNIFIED, NAME-ADDRESSED entry point over the pi-dispatch
# primitives, mirroring Claude Code's native sub-agent verbs:
#
#   native                      pi-agent.sh
#   ------------------------    -----------------------------------------
#   Agent(name:.., prompt:..)   start NAME [--profile P] BRIEF
#   SendMessage(to: name)       send NAME TEXT_OR_FILE
#   TaskOutput / poll           poll NAME
#   agent view peek             peek NAME
#   agent panel                 ls
#   TaskStop                    stop NAME
#   background-完成通知 glue     watch [INTERVAL]   (feed to the Monitor tool)
#
# This is the FALLBACK control plane. Inside a herdr pane (HERDR_ENV=1) drive
# the same omp workers with `herdr agent` instead — it gives a live pane, a
# native blocked state, and immediate death detection. These verbs are what
# works everywhere else (cron, CI, the web and IDE clients).
#
# Registry: the filesystem IS the registry — $PI_RUNS_DIR/agents/<NAME> is a
# symlink to the run's RUNDIR. No database, no daemon. `send` on a finished
# run resumes it (new RUNDIR, same session context) and re-points the symlink,
# so a NAME follows the conversation like a native agent id does.
#
# watch: loops over every registered agent, polls each, and prints ONE line per
# MEANINGFUL state change (volatile elapsed/stale counters normalized away).
# Exits 0 when no agent is in flight (nothing RUNNING) — arm it on the Monitor
# tool and each emitted line becomes a chat notification, which is the native
# "background agent completed" experience.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REG="${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/agents"

usage() {
  echo "usage: pi-agent.sh start NAME [--profile P] BRIEF" >&2
  echo "       pi-agent.sh send NAME TEXT_OR_FILE" >&2
  echo "       pi-agent.sh poll|peek|stop NAME" >&2
  echo "       pi-agent.sh ls" >&2
  echo "       pi-agent.sh watch [INTERVAL_SECONDS]" >&2
  exit 2
}

# resolve NAME -> RUNDIR (must exist).
resolve() {
  local name="$1" link="$REG/$1"
  RUNDIR="$(readlink "$link" 2>/dev/null || true)"
  [ -n "$RUNDIR" ] && [ -d "$RUNDIR" ] || { echo "pi-agent: unknown agent '$name' (see: pi-agent.sh ls)" >&2; exit 1; }
}

register() { # NAME RUNDIR
  mkdir -p "$REG"
  ln -sfn "$2" "$REG/$1"
}

VERB="${1:-}"; shift || true
case "$VERB" in

start)
  NAME="${1:?start needs NAME}"; shift
  [[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] || { echo "pi-agent: NAME must be [A-Za-z0-9_-]" >&2; exit 2; }
  [ -e "$REG/$NAME" ] && { echo "pi-agent: '$NAME' already exists (stop it or pick another name)" >&2; exit 1; }
  PROFILE=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --profile) PROFILE="${2:?--profile needs NAME}"; shift 2 ;;
      *) break ;;
    esac
  done
  BRIEF="${1:-}"
  [ -n "$BRIEF" ] || { echo "pi-agent: start needs a BRIEF" >&2; exit 2; }
  OUT="$("$SCRIPT_DIR/pi-dispatch.sh" ${PROFILE:+--profile "$PROFILE"} "$BRIEF")"
  RUNDIR="$(printf '%s\n' "$OUT" | sed -n 's/^RUNDIR=//p')"
  register "$NAME" "$RUNDIR"
  printf '%s\n' "$OUT"
  echo "NAME=$NAME"
  ;;

send)
  NAME="${1:?send needs NAME}"; ARG="${2:?send needs TEXT_OR_FILE}"
  resolve "$NAME"
  LINE="$("$SCRIPT_DIR/pi-poll.sh" "$RUNDIR")"
  case "$LINE" in
    RUNNING*) echo "pi-agent: '$NAME' is still running — wait for the turn to finish (poll/watch)" >&2; exit 1 ;;
  esac
  # Finished run: resume the same session with the new brief (native
  # SendMessage semantics — a stopped agent picks its context back up).
  OUT="$("$SCRIPT_DIR/pi-dispatch.sh" "$ARG" "${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/pi-dispatch" "$RUNDIR")"
  NEWDIR="$(printf '%s\n' "$OUT" | sed -n 's/^RUNDIR=//p')"
  register "$NAME" "$NEWDIR"
  printf '%s\n' "$OUT"
  ;;

poll)
  NAME="${1:?poll needs NAME}"; resolve "$NAME"
  "$SCRIPT_DIR/pi-poll.sh" "$RUNDIR"
  ;;

peek)
  NAME="${1:?peek needs NAME}"; resolve "$NAME"
  "$SCRIPT_DIR/pi-watch.sh" "$RUNDIR"
  ;;

ls)
  [ -d "$REG" ] || { echo "no agents"; exit 0; }
  FOUND=0
  for link in "$REG"/*; do
    [ -L "$link" ] || continue
    name="$(basename "$link")"
    dir="$(readlink "$link")"
    if [ ! -d "$dir" ]; then rm -f "$link"; continue; fi   # prune dangling
    FOUND=1
    echo "$name $("$SCRIPT_DIR/pi-poll.sh" "$dir")"
  done
  [ "$FOUND" = 1 ] || echo "no agents"
  ;;

stop)
  NAME="${1:?stop needs NAME}"; resolve "$NAME"
  "$SCRIPT_DIR/pi-stop.sh" "$RUNDIR"
  rm -f "$REG/$NAME"
  echo "unregistered $NAME"
  ;;

watch)
  INTERVAL="${1:-15}"
  STATE="$(mktemp -d)"
  trap 'rm -rf "$STATE"' EXIT
  while :; do
    ACTIVE=0
    if [ -d "$REG" ]; then
      for link in "$REG"/*; do
        [ -L "$link" ] || continue
        name="$(basename "$link")"; dir="$(readlink "$link")"
        [ -d "$dir" ] || continue
        line="$("$SCRIPT_DIR/pi-poll.sh" "$dir")"
        case "$line" in RUNNING*) ACTIVE=1 ;; esac
        # Normalize volatile counters (elapsed/stale seconds) so a still-running
        # turn doesn't re-emit every sweep; emit only on meaningful change.
        norm="$(printf '%s' "$line" | sed -E 's/[0-9]+s/Ns/g')"
        if [ "$norm" != "$(cat "$STATE/$name" 2>/dev/null || true)" ]; then
          printf '%s\n' "$norm" > "$STATE/$name"
          echo "$name: $line"
        fi
      done
    fi
    [ "$ACTIVE" = 1 ] || { echo "--- no agents in flight ---"; exit 0; }
    sleep "$INTERVAL"
  done
  ;;

*) usage ;;
esac
