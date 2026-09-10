---
name: survey
description: >-
  Survey a codebase for deepening opportunities — shallow modules, leaking
  seams, interfaces that are hard to test through — then hand candidates as
  a Mermaid report.
disable-model-invocation: true
---

# Survey

## 1. Scope

If `$ARGUMENTS` is non-empty, that string is the scope. Skip hotspot inference. Tell the user the chosen scope in one line, then go to Context.

Otherwise run, from the repository root:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/hotspots.sh"
```

Read the `scope:` line.

- `scope: hotspot` — the ranked paths (top three) are the scope.
- `scope: wide` — the whole tree is the scope; keep the ranked list as hints. If history is thin (`window` below 10 or an empty log), say in the one-line scope message that the whole tree is being surveyed because history is thin.

If hotspots.sh exits 1 (`not a git repository`) and `$ARGUMENTS` is empty, stop. Ask in plain prose for a direction. That is an input question, not permission.

Tell the user the chosen scope in one line before anything else runs: the direction, the hotspot paths, or "whole tree".

## 2. Context

Before dispatch, read `CONTEXT.md` if it exists and any ADRs under `docs/adr/`. They constrain what a candidate may contradict.
