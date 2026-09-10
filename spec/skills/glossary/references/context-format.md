# CONTEXT.md Format

Format adapted from [mattpocock/skills](https://github.com/mattpocock/skills) `domain-modeling` (MIT, Copyright (c) 2026 Matt Pocock), commit 3cca18b368ae95cdbdebbff572ccafa662551015.

Single-context glossary. Read this before the first write.

## Structure

```md
# {Context Name}

{One or two sentences on what this context is.}

## Language

**Order**:
A customer's request to buy something.
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent after delivery.
_Avoid_: Bill
```

## Rules

- **Be opinionated.** When several words name the same concept, pick one and list the rest under `_Avoid_`.
- **Keep definitions tight.** One or two sentences. Define what it IS, not what it does.
- **Only include terms specific** to this project. General programming ideas do not belong.
- **Group terms under subheadings** when clusters appear. A flat list is fine when they do not.
