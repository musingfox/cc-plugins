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

## 3. Explore

Print the one-line scope and how many explorers will run. Dispatch them in one message, at most three.

For each scope path (or one explorer for the whole tree), call:

`Agent(subagent_type: "deepen:explorer", prompt: "Report path: /tmp/viz/<project>/deepen-explorer-<timestamp>-<n>.md\nScope: <path or whole tree>\n")`

`<project>` is `$(basename "$PWD")`. Timestamp the files so a stale report from an earlier run cannot be mistaken for this one. Explorers run in parallel. Print nothing else until they return.

If a report file is missing after dispatch, say which scope produced nothing and continue with the others.

## 4. Read

Do not Read an explorer report whole. For each `/tmp/viz/<project>/deepen-explorer-*.md` that exists, take only:

```bash
sed -n '/^## Summary/,/^## Notes/p' /tmp/viz/<project>/deepen-explorer-<timestamp>-<n>.md
```

That range stops at `## Notes` (inclusive of the heading, exclusive of the trail). Never load `## Notes`.

## 5. Report

Write the candidate report yourself, following `${CLAUDE_PLUGIN_ROOT}/docs/report.md`, to `/tmp/viz/<project>/deepen-survey-<timestamp>.md`. Do NOT propose interfaces. Zero friction entries across all explorers: put `No candidates` under `## Top recommendation`, name the scope, and still render.

## 6. Render

From the repository root:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/scripts/render-survey.sh" /tmp/viz/<project>/deepen-survey-<timestamp>.md
```

Print the report path.

## 7. Hand-off

Which of these would you like to explore?

Narrowing a chosen candidate is `/spiral`'s job. This skill ends at the report.
