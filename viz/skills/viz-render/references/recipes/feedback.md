# Recipe: feedback

The **generic** recipe for "render any markdown for a human, collect their
feedback, write it back for an agent to read." Unlike `pr-review` (which hard-codes
a code-review grammar), `feedback` makes **no assumption about the document**: the
body is rendered read-only and kept verbatim, and only the human's feedback —
`choice` (the selected option/s) and `notes` (free text) — round-trips through
frontmatter. Reach for this for decision briefs, approvals, "review this and tell
me X" — anything that is a document plus a small structured response. One document
can carry a single question or a whole **round** of independent ones (see below).

## Trigger

Use when a human needs to read a rendered document and return a structured answer
(a pick + a comment) that an agent then consumes. If the task instead needs the
human to edit many fields inside a structured document, that is the rare case
`pr-review` covers — not this recipe.

## Markdown structure — single question

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

## Round mode — several independent decisions in one document

A **dotted** frontmatter key (`q1.options`, `q1.choice`, …) declares a field of a
per-question block. Any dotted key switches the recipe into round mode: the panel
renders one block per question, in first-appearance order, and the top-level
`options` / `recommend` / `choice` are ignored.

```markdown
---
viz: feedback
title: <header title>
panel: <feedback-panel heading>
prompt: <one-line instruction>
q1.title: <question heading>
q1.options: <A> | <B> | <C>              # optional; omit for a notes-only question
q1.recommend: <one of q1's options>      # optional; tagged 建議
q1.multi: true                           # optional; several picks allowed
q1.choice:                               # leave empty — pipe-separated when saved
q1.notes:                                # leave empty — this question's reasoning
q2.title: <question heading>
q2.options: <A> | <B>
q2.choice:
notes:                                   # round-level free text, still available
---
```

### Rules

- **Question id** — anything without a dot or whitespace (`q1`, `storage`). Order in
  the frontmatter is order on screen.
- **Fields** — only `title`, `options`, `recommend`, `multi`, `choice`, `notes` are
  recognised after the dot. Everything else stays an ordinary top-level key.
- **`<id>.multi: true`** — the option cards become checkboxes. Without it a question
  is single-select, and re-clicking the selected card clears it.
- **`<id>.choice`** — always a *list* on disk, pipe-separated, empty when unanswered.
  A single-select answer is simply a one-element list, so a reader parses both the
  same way.
- **Missing answer keys** are written back inside their own question block, so `q1`'s
  answer never lands under `q2`'s title.
- **Put every genuinely independent decision in one round**; a question whose answer
  depends on another question in the same round belongs to the next round.

## Bidirectional flow

1. Agent writes the markdown file (canonical source), the answer keys empty.
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
(idempotent) and leaves the body unchanged. Round mode holds the same guarantees
per question, and inserts a missing `<id>.choice` / `<id>.notes` inside its own
block rather than at the end. Verified by `viz/tests/feedback.roundtrip.test.js`
against `tests/fixtures/feedback/sample.md` and `round.md`.

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
