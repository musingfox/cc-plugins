#!/usr/bin/env bash
# pi-agent.sh — the UNIFIED, NAME-ADDRESSED entry point over the pi-dispatch
# primitives, mirroring Claude Code's native sub-agent verbs:
#
#   native                      pi-agent.sh
#   ------------------------    -----------------------------------------
#   Agent(name:.., prompt:..)   start NAME [--acp] [--profile P] [BRIEF]
#   SendMessage(to: name)       send NAME TEXT_OR_FILE
#   TaskOutput / poll           poll NAME
#   agent view peek             peek NAME
#   agent panel                 ls
#   TaskStop                    stop NAME
#   background-完成通知 glue     watch [INTERVAL]   (feed to the Monitor tool)
#
# Registry: the filesystem IS the registry — $PI_RUNS_DIR/agents/<NAME> is a
# symlink to the run's RUNDIR. No database, no daemon. `send` on a finished
# batch run resumes it (new RUNDIR, same session context) and re-points the
# symlink, so a NAME follows the conversation like a native agent id does.
#
# Mode detection: a RUNDIR containing in.fifo is an ACP session (interactive,
# pi-acp-*.sh); anything else is a batch run (pi-dispatch.sh / pi-poll.sh).
#
# watch: loops over every registered agent, polls each, and prints ONE line per
# MEANINGFUL state change (volatile elapsed/stale counters normalized away).
# Exits 0 when no agent is in flight (nothing RUNNING, no PERMISSION pending) —
# arm it on the Monitor tool and each emitted line becomes a chat notification,
# which is the native "background agent completed / needs input" experience.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REG="${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/agents"

usage() {
  echo "usage: pi-agent.sh start NAME [--acp] [--profile P] [BRIEF]" >&2
  echo "       pi-agent.sh send NAME TEXT_OR_FILE" >&2
  echo "       pi-agent.sh poll|peek|stop NAME" >&2
  echo "       pi-agent.sh ls" >&2
  echo "       pi-agent.sh watch [INTERVAL_SECONDS]" >&2
  exit 2
}

# resolve NAME -> RUNDIR (must exist), sets RUNDIR + MODE (acp|batch).
resolve() {
  local name="$1" link="$REG/$1"
  RUNDIR="$(readlink "$link" 2>/dev/null || true)"
  [ -n "$RUNDIR" ] && [ -d "$RUNDIR" ] || { echo "pi-agent: unknown agent '$name' (see: pi-agent.sh ls)" >&2; exit 1; }
  MODE=batch
  if [ -p "$RUNDIR/in.fifo" ]; then MODE=acp; fi
}

# poll_line RUNDIR MODE -> one status line from the mode-appropriate poller.
poll_line() {
  if [ "$2" = acp ]; then "$SCRIPT_DIR/pi-acp-poll.sh" "$1"; else "$SCRIPT_DIR/pi-poll.sh" "$1"; fi
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
  ACP=0; PROFILE=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --acp) ACP=1; shift ;;
      --profile) PROFILE="${2:?--profile needs NAME}"; shift 2 ;;
      *) break ;;
    esac
  done
  BRIEF="${1:-}"
  if [ "$ACP" = 1 ]; then
    OUT="$("$SCRIPT_DIR/pi-acp-start.sh")"
    RUNDIR="$(printf '%s\n' "$OUT" | sed -n 's/^RUNDIR=//p')"
    register "$NAME" "$RUNDIR"
    printf '%s\n' "$OUT"
    [ -z "$BRIEF" ] || "$SCRIPT_DIR/pi-acp-send.sh" "$RUNDIR" prompt "$BRIEF"
  else
    [ -n "$BRIEF" ] || { echo "pi-agent: batch start needs a BRIEF" >&2; exit 2; }
    OUT="$("$SCRIPT_DIR/pi-dispatch.sh" ${PROFILE:+--profile "$PROFILE"} "$BRIEF")"
    RUNDIR="$(printf '%s\n' "$OUT" | sed -n 's/^RUNDIR=//p')"
    register "$NAME" "$RUNDIR"
    printf '%s\n' "$OUT"
  fi
  echo "NAME=$NAME"
  ;;

send)
  NAME="${1:?send needs NAME}"; ARG="${2:?send needs TEXT_OR_FILE}"
  resolve "$NAME"
  if [ "$MODE" = acp ]; then
    "$SCRIPT_DIR/pi-acp-send.sh" "$RUNDIR" prompt "$ARG"
  else
    LINE="$(poll_line "$RUNDIR" batch)"
    case "$LINE" in
      RUNNING*) echo "pi-agent: '$NAME' is still running — wait for the turn to finish (poll/watch)" >&2; exit 1 ;;
    esac
    # Finished batch run: resume the same session with the new brief (native
    # SendMessage semantics — a stopped agent picks its context back up).
    OUT="$("$SCRIPT_DIR/pi-dispatch.sh" "$ARG" "${PI_RUNS_DIR:-$HOME/.cache/pi-runs}/pi-dispatch" "$RUNDIR")"
    NEWDIR="$(printf '%s\n' "$OUT" | sed -n 's/^RUNDIR=//p')"
    register "$NAME" "$NEWDIR"
    printf '%s\n' "$OUT"
  fi
  ;;

poll)
  NAME="${1:?poll needs NAME}"; resolve "$NAME"
  poll_line "$RUNDIR" "$MODE"
  ;;

peek)
  NAME="${1:?peek needs NAME}"; resolve "$NAME"
  if [ "$MODE" = acp ]; then
    poll_line "$RUNDIR" acp
    [ ! -s "$RUNDIR/result.md" ] || echo "TEXT $(tr '\n' ' ' < "$RUNDIR/result.md" | cut -c1-200)"
  else
    "$SCRIPT_DIR/pi-watch.sh" "$RUNDIR"
  fi
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
    mode=batch; [ -p "$dir/in.fifo" ] && mode=acp
    echo "$name mode=$mode $(poll_line "$dir" "$mode")"
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
        mode=batch; [ -p "$dir/in.fifo" ] && mode=acp
        line="$(poll_line "$dir" "$mode")"
        case "$line" in RUNNING*|PERMISSION*) ACTIVE=1 ;; esac
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
