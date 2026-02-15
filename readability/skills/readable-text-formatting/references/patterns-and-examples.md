# Readable Text Formatting Patterns and Examples

## Common ASCII Patterns

### Simple Box

```
┌────────────────────┐
│  Content goes here │
│  Another line      │
└────────────────────┘
```

### Box with Title

```
┌────────────────────┐
│      TITLE         │
├────────────────────┤
│  Content line 1    │
│  Content line 2    │
└────────────────────┘
```

### Flowchart Nodes

```
    ┌─────────────┐
    │   Start     │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │  Process 1  │
    └──────┬──────┘
           │
           ▼
    ┌─────────────┐
    │     End     │
    └─────────────┘
```

### Side-by-side Boxes

```
┌─────────────┐       ┌─────────────┐
│   Box A     │  ───▶ │   Box B     │
│  Content A  │       │  Content B  │
└─────────────┘       └─────────────┘
```

### Multi-level Hierarchy

```
┌─────────────────────────────────────┐
│           Application               │
├─────────────────────────────────────┤
│  ┌───────────┐    ┌───────────┐    │
│  │ Frontend  │◀──▶│  Backend  │    │
│  └───────────┘    └───────────┘    │
│         │              │            │
│         ▼              ▼            │
│  ┌───────────┐    ┌───────────┐    │
│  │    UI     │    │    API    │    │
│  └───────────┘    └───────────┘    │
└─────────────────────────────────────┘
```

### Process Flow with Decision Points

```
        ┌──────────┐
        │  Start   │
        └────┬─────┘
             │
        ┌────▼────┐
        │  Valid? │
        └────┬────┘
             │
      ┌──────┴──────┐
     YES            NO
      │             │
      ▼             ▼
┌──────────┐   ┌──────────┐
│ Process  │   │  Reject  │
└────┬─────┘   └────┬─────┘
     └──────┬───────┘
            ▼
       ┌──────────┐
       │   End    │
       └──────────┘
```

## Character Sets for Borders

**Box Drawing Characters:**
- Light: `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼`
- Heavy: `━ ┃ ┏ ┓ ┗ ┛ ┣ ┫ ┳ ┻ ╋`
- Double: `═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬`
- ASCII-safe: `- | + (corners and intersections)`

**Arrows:**
- Unicode: `→ ← ↑ ↓ ↔ ↕`
- Bold: `⇒ ⇐ ⇑ ⇓ ⇔`
- Filled: `▶ ◀ ▲ ▼`
- ASCII-safe: `> < ^ v`

## Common Mistakes

### Inconsistent Column Widths

```markdown
<!-- BAD -->
| Name | Age | City |
|---|---|---|
| Alice | 30 | San Francisco |

<!-- GOOD -->
| Name  | Age | City          |
|-------|-----|---------------|
| Alice | 30  | San Francisco |
```

### Misaligned Box Borders

```
<!-- BAD -->
┌─────────┐
│ Hello World! │
└─────────┘

<!-- GOOD -->
┌──────────────┐
│ Hello World! │
└──────────────┘
```

### Content Exceeds Border

```
<!-- BAD -->
┌────────────────┐
│  Username: admin │
│  Password: ***   │
└────────────────┘

<!-- GOOD -->
┌──────────────────┐
│ Username: admin  │
│ Password: ***    │
└──────────────────┘
```

## Advanced Patterns

### Complex Table with Merged Headers

```
| Category    | Q1 Results      | Q2 Results      |
|             | Sales | Profit  | Sales | Profit  |
|-------------|-------|---------|-------|---------|
| Product A   | $100K |  $20K   | $110K |  $22K   |
| Product B   | $80K  |  $15K   | $85K  |  $16K   |
```

### Right-aligned Numbers

```markdown
| Item   | Quantity | Price   | Total    |
|--------|----------|---------|----------|
| Widget |       10 |   $5.00 |  $50.00  |
| Gadget |        5 |  $12.50 |  $62.50  |
```

## Quick Reference

**Table column width:**
```
width = max(header_length, max(all_data_lengths_in_column))
```

**Box width:**
```
box_width = max_content_width + 2 (padding) + 2 (borders)
```

**Padding:**
```
padding_needed = column_width - actual_content_length
padded_content = content + (" " * padding_needed)
```
