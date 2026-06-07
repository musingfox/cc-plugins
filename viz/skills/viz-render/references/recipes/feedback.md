# Recipe: feedback

The **generic** recipe for "render any markdown for a human, collect their
feedback, write it back for an agent to read." Unlike `pr-review` (which hard-codes
a code-review grammar), `feedback` makes **no assumption about the document**: the
body is rendered read-only and kept verbatim, and only the human's feedback —
`choice` (one selected option) and `notes` (free text) — round-trips through
frontmatter. Reach for this for decision briefs, approvals, "review this and tell
me X" — anything that is a document plus a small structured response.

## Trigger

Use when a human needs to read a rendered document and return a structured answer
(a pick + a comment) that an agent then consumes. If the task instead needs the
human to edit many fields inside a structured document, that is the rare case
`pr-review` covers — not this recipe.

## Markdown structure

```markdown
---
viz: feedback
title: <header title>
panel: <feedback-panel heading>          # optional, default "你的回饋"
badge: <small pill in the top bar>       # optional, default "回饋"
prompt: <one-line instruction>           # optional, sensible default
options: <A> | <B> | <C>                 # optional; present → selectable cards
recommend: <one of the options>          # optional; tagged 建議
notes_label: <textarea label>            # optional, default "回饋 / 理由（選填）"
choice:                                  # leave empty — the human fills it
notes:                                   # leave empty — the human fills it
---

<any markdown body: prose, tables, mermaid — rendered read-only and verbatim>
```

### Rules

- **Frontmatter required**, must contain `viz: feedback`.
- **`options:`** — pipe-separated (full-width `｜` or ASCII `|`). Each becomes a
  single-select card. Omit for a notes-only panel.
- **`recommend:`** — must match an option label exactly; shown as `建議`.
- **`choice:` / `notes:`** — author leaves empty; the human fills them in-browser.
  **Save** writes them back here. `notes` newlines are stored as the literal `\n`
  on one line; unescape when reading.
- **`panel` / `badge` / `prompt` / `notes_label`** — optional label overrides so
  the recipe carries no domain-specific wording; all have defaults.
- **Body** — rendered read-only and verbatim (markdown + mermaid); never rewritten.

## Bidirectional flow

1. Agent writes the markdown file (canonical source), `choice`/`notes` empty.
2. `bash "${CLAUDE_PLUGIN_ROOT}/lib/render.sh" <file.md> <name>` starts the server
   and opens the interactive page (http://, so Save works).
3. Human reads the body, picks an option, writes notes.
4. Human clicks **儲存回饋 (Save)** → `POST /api/save` writes `choice`/`notes`
   back into the same `.md`; the body is untouched.
5. Agent re-reads the `.md` and takes `choice:` and `notes:` as the human's
   answer. Empty `choice:` = not saved → fall back to a terminal answer.

If opened via `file://` (no server) the Save button hides; **複製 (Export)** copies
the updated markdown to paste back instead.

## Round-trip preservation

Body preserved byte-for-byte; frontmatter key order preserved. A no-op
load→serialize is exact; setting feedback appends `choice`/`notes` once
(idempotent) and leaves the body unchanged. Verified by
`viz/tests/feedback.roundtrip.test.js`.

## Example

```markdown
---
viz: feedback
title: 計費規則要變 — 這次方向探討夠好可以收工了嗎？
panel: 你的決定
options: 收工 | 實跑驗證 | 補缺口
recommend: 收工
choice:
notes:
---

## 一句話背景

訂閱方案 6/15 起把程式呼叫的用量獨立計費，用完會直接停。我們這個專案正好踩到。

## 你的選項

- **收工（建議）**：方向分析已夠好，真要動工再驗證。
- **實跑驗證**：實際設 key 驗證外掛是否還在；需 API key、會花錢。
- **補缺口**：補兩個小註記；邊際價值低。
```

## Relation to pr-review

`pr-review` is the **exception**, not the template: it bakes in a code-review
grammar (severities, finding cards, an open/fixed/wontfix status machine) and
makes every field inline-editable through a full-document model. Use it only when
you genuinely need that. For everything else — a document plus a structured
response — use this generic `feedback` recipe.
