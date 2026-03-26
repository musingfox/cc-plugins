---
name: collab-edit
description: >-
  Collaborate with the user by opening a shared markdown file in their terminal editor.
  Triggers when asking the user to review/edit content, or when user requests collaborative editing.
  Detects completion signals in both English and Traditional Chinese.
when-to-use: >-
  Use when you want the user to directly edit content you've generated, when requesting user input
  on a document, or when the user asks to collaboratively edit something. After the user signals
  completion (via phrases like "check my changes", "done editing", "我改好了", "看一下修改", etc.),
  show a diff and incorporate their changes.
---

# Collaborative Edit Skill

This skill enables real-time collaboration by opening a markdown file in the user's terminal editor (neovim), then detecting completion and showing a diff of changes.

## Phase 1: Initiation

When triggered (user asks to collaboratively edit, or you want the user to review/edit content):

1. **Write the content** to `/tmp/viz-collab.md` using the Write tool
2. **Save a baseline copy** to `/tmp/viz-collab-original.md` using the Write tool (for diffing later)
3. **Open the editor** by running:
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/skills/collab-edit/lib/ghostty-split.sh" "nvim /tmp/viz-collab.md"
   ```
4. **Inform the user**:
   - "已在右側分割視窗開啟編輯器,檔案位於 `/tmp/viz-collab.md`"
   - "請直接編輯,完成後告訴我「看一下修改」、「我改好了」或「done editing」"
   - (Optional) Suggest: "如果想要更好的預覽效果,可以安裝 render-markdown.nvim 插件"

## Phase 2: Completion Detection

Watch for these trigger phrases (case-insensitive, any language):

**English triggers**:
- "check my changes"
- "done editing"
- "done"
- "review this"
- "finished"

**Traditional Chinese triggers**:
- "看一下修改"
- "我改好了"
- "完成了"
- "看一下"

## Phase 3: Review and Iteration

When the user signals completion:

1. **Read the edited file**:
   ```bash
   Read /tmp/viz-collab.md
   ```

2. **Generate diff**:
   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/skills/collab-edit/lib/diff.sh" "/tmp/viz-collab-original.md" "/tmp/viz-collab.md"
   ```

3. **Show the diff** to the user with context about what changed

4. **Incorporate changes** into your understanding and conversation context

5. **Ask for next action**:
   - "修改已檢視完畢。要繼續編輯還是已完成?"
   - "Would you like to continue editing or are we done?"

6. **If continuing**:
   - Update the baseline: `cp /tmp/viz-collab.md /tmp/viz-collab-original.md` (via Bash tool)
   - Tell the user: "已更新基準版本,可以繼續編輯" / "Baseline updated, you can continue editing"
   - Return to Phase 2 (wait for next completion signal)

## Error Handling

- If `ghostty-split.sh` fails: Inform user that Ghostty must be running
- If `diff.sh` returns exit 1: This means no changes detected, inform the user
- If `diff.sh` fails: Check that both original and edited files exist

## Notes

- The diff tool automatically uses `delta` if available, otherwise falls back to `diff -u`
- The collaboration file path is always `/tmp/viz-collab.md` (consistent location)
- Each iteration updates the baseline so diffs only show incremental changes
- Multiple edit sessions can occur in one conversation
