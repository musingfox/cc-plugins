---
name: viz-router
description: >-
  This skill should be used when the user wants to EDIT content (not just view it),
  asks to "edit this document", "revise the draft", "modify this content",
  "collaboratively edit", "let me edit", or when Claude wants the user to
  review and modify a draft. Routes to the best editing method based on terminal
  environment (browser editor, Ghostty split, or fallback).
  Do NOT use for view-only rendering — let doc-render or mermaid-display handle those.
---

# Viz Router

Route document visualization and editing to the best available method.

## Step 1: Gather Environment Info

Before making any decision, run this command to collect environment signals:

```bash
echo "TERM_PROGRAM=${TERM_PROGRAM:-unknown}"
echo "GHOSTTY=$([ "${TERM_PROGRAM}" = "ghostty" ] && echo "yes" || echo "no")"
echo "SSH=$([ -n "${SSH_CLIENT:-}${SSH_CONNECTION:-}" ] && echo "yes" || echo "no")"
echo "EDITOR_MCP=$(command -v node >/dev/null 2>&1 && [ -f "${CLAUDE_PLUGIN_ROOT}/mcp-editor/dist/index.js" ] && echo "available" || echo "unavailable")"
```

Record the output. Do NOT skip this step.

## Step 2: Route

Use the environment info to choose the editing method:

| Condition | Method | How |
|-----------|--------|-----|
| `EDITOR_MCP=available` | **viz-editor** (browser) | Call `edit-document` MCP tool with content. Blocks until user clicks Done. Result is the edited markdown. |
| `GHOSTTY=yes` and editor MCP unavailable | **collab-edit** (terminal split) | Write content to `/tmp/viz-collab.md`, run `bash "${CLAUDE_PLUGIN_ROOT}/skills/collab-edit/lib/ghostty-split.sh" "nvim /tmp/viz-collab.md"`, wait for user completion signal. |
| Neither available | **File fallback** | Write content to `/tmp/viz-collab.md`, tell user the path, ask them to edit in their preferred editor and tell you when done. |

### Why this priority order:
1. **viz-editor** (browser) — full Mermaid/KaTeX rendering, atomic tool call (one call = one edit), no terminal-specific deps
2. **collab-edit** (Ghostty) — stays in terminal, good with render-markdown.nvim, but multi-step
3. **Fallback** — always works, but manual

### Override: user explicitly requests a method
If the user says "open in neovim", "在 terminal 裡編輯" → use collab-edit regardless.
If the user says "open in browser", "用瀏覽器" → use viz-editor regardless.

## Step 3: Execute

After routing, execute the chosen method. Do not explain the routing decision unless the user asks why.

## Examples

**User**: "把這個計畫渲染出來看看"
→ Intent: view-only → use doc-render skill

**User**: "幫我產生一份草稿，我想自己改一下"
→ Intent: collaborative edit → check environment → route to viz-editor or collab-edit

**Claude decides to show a complex comparison table**:
→ Intent: view-only → use doc-render skill proactively

**User**: "我們一起改這份文件"
→ Intent: collaborative edit → check environment → route

**User**: "用 neovim 開給我改"
→ Intent: collaborative edit, explicit method → use collab-edit regardless of environment
