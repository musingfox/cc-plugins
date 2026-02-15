---
name: readable-text-formatting
description: >-
  Activated when generating markdown tables, ASCII art, text-based diagrams, box-drawing layouts,
  or any formatted text that will be read in raw monospace form. Ensures column alignment, border
  consistency, and proper padding in all text output.
---

# Readable Text Formatting

Ensure all generated formatted text is human-readable in raw monospace form. This applies to markdown tables, ASCII diagrams, and any text with visual structure.

## Core Principles

1. **Alignment is for human readers** — raw `.md` files should be scannable in a text editor
2. **Consistent column width** — each column padded to the longest content in that column
3. **Border alignment** — all vertical and horizontal boundaries align perfectly

## Markdown Tables

### The Problem

```markdown
| Name | Age | Occupation |
|---|---|---|
| Alice | 30 | Software Engineer |
| Christopher | 45 | Product Manager |
```

### The Solution

```markdown
| Name        | Age | Occupation        |
|-------------|-----|-------------------|
| Alice       | 30  | Software Engineer |
| Christopher | 45  | Product Manager   |
```

### How to Create Aligned Tables

**Step 1: Determine column widths** — for each column, find `max(header_length, max(all_data_lengths))`.

**Step 2: Pad all cells** — add trailing spaces to reach the column width.

**Step 3: Create separator** — fill with dashes matching the column width exactly.

## ASCII Diagrams

### The Problem

```
┌─────────────┐
│ Title Here │
│ Some content that is longer │
└─────────────┘
```

### The Solution

All borders must align vertically:

```
┌──────────────────────────────┐
│ Title Here                   │
│ Some content that is longer  │
└──────────────────────────────┘
```

### How to Create Aligned Diagrams

**Step 1: Find maximum content width** — the longest line inside the box.

**Step 2: Calculate border width** — `content_width + 2 (padding) + 2 (border chars)`.

**Step 3: Build each line**:
- Top: `┌` + dashes + `┐`
- Content: `│` + text + padding + `│`
- Bottom: `└` + dashes + `┘`

## Self-Check Before Output

Before finalizing any formatted text, verify:

1. **Visual alignment** — all vertical lines align, all horizontal lines are continuous
2. **Width consistency** — every row/line has the same total width
3. **Border integrity** — top and bottom borders match width, left and right borders align on every line

## Best Practices

- **Monospace mental model**: assume output is viewed in a monospace font
- **Measure first**: calculate all widths before generating text
- **Default to ASCII-safe**: if Unicode box-drawing might cause issues, use `+`, `-`, `|`
- **Test with longest content**: dimensions based on the widest content

## References

- **ASCII patterns, character sets, common mistakes, advanced examples**: `references/patterns-and-examples.md`
