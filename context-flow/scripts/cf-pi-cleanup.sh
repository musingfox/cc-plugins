#!/usr/bin/env bash
# Success-path cleanup of cf's own scaffolding (cf.md "Scaffolding leaves no
# trace"): shard branches, checkpoint tags, rollback refs, and the integration
# branch with its worktree when its tree is the one on cf/<slug>.
#
# A script rather than an inline block because guard-bash.sh reads only the
# command text: it cannot resolve "cf/$CF_SLUG-integrated" or "$b", and the
# linearized shard commits live on no other ref, so it blocks the inline form.
#
# Usage:   cf-pi-cleanup.sh FLOW_SESSION SLUG   (run from the host repo)
# Exit:    0 done, 2 usage
# Output:  one "kept …" line when the integration branch is kept

set -uo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: cf-pi-cleanup.sh FLOW_SESSION SLUG" >&2
  exit 2
fi
session="$1"; slug="$2"

if [ "$(git rev-parse -q --verify "cf/$slug-integrated^{tree}")" = "$(git rev-parse -q --verify "cf/$slug^{tree}")" ]; then
  git worktree remove --force "$session/integrated-work" >/dev/null 2>&1 || true
  git branch -D "cf/$slug-integrated" >/dev/null 2>&1 || true
elif git rev-parse -q --verify "cf/$slug-integrated" >/dev/null; then
  echo "kept cf/$slug-integrated and $session/integrated-work: its tree differs from cf/$slug"
fi
for b in $(git for-each-ref --format='%(refname:short)' "refs/heads/cf/$slug-shard-*"); do
  git branch -D "$b" >/dev/null 2>&1 || true
done
for t in $(git tag -l "cf-checkpoint/$(basename "$session")/*"); do
  git tag -d "$t" >/dev/null 2>&1 || true
done
for r in $(git for-each-ref --format='%(refname)' "refs/cf-rollback/$(basename "$session")/"); do
  git update-ref -d "$r" >/dev/null 2>&1 || true
done
exit 0
