---
id: cross-plugin-runtime-resolution
status: accepted
scope:
  - "context-flow/scripts/**"
  - "spiral/scripts/**"
verify: check:test -z "$(find . -path ./pi-dispatch -prune -o \( -name pi-dispatch.sh -o -name pi-worktree.sh \) -print 2>/dev/null)"
related: [dispatch-verdict-from-file]
adr: null
---
Plugins that need pi-dispatch's runtime resolve it at execution time through a
sibling resolver — never by vendoring a copy of the script. The canonical
resolver is `resolve_canon_dispatch()` in `context-flow/scripts/cf-pi-env.sh`:
it globs sibling and grandparent plugin roots, sorts by version, and takes the
highest.

Each caller keeps its own failure branch (dispatch fails hard, poll fails soft
with NO_PID, stop falls back to a nonexistent path). The resolver itself always
returns 0 — it reports "not found" as empty output, never as an exit code.

A vendored copy is the failure this forbids: it pins a version that stops
tracking the canonical plugin, and the drift is silent because both copies run.
