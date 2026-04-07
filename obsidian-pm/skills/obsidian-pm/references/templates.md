# Obsidian PM Templates Reference

These are Obsidian templates that use `{{date}}` and `{{title}}` variables, which Obsidian's core Templates plugin auto-replaces when inserting a template.

Templates should be placed at `pm/templates/` inside the vault. The vault's **Settings > Templates > Template folder location** must be set to `pm/templates/` for template insertion to work.

If templates do not exist in the vault, create them using the definitions below.

---

## task.md

```markdown
---
status: todo
priority: medium
project: 
type: task
due: 
tags: []
created: {{date}}
---

# {{title}}

## Description



## Acceptance Criteria

- [ ] 

## Notes

```

## doc.md

```markdown
---
type: doc
project: 
created: {{date}}
updated: {{date}}
---

# {{title}}

## Overview



## Details

```

## adr.md

```markdown
---
type: adr
project: 
status: proposed
created: {{date}}
deciders: 
---

# {{title}}

## Context and Problem Statement



## Decision Drivers

- 

## Considered Options

1. 
2. 

## Decision Outcome

Chosen option: 

### Consequences

- Good, because 
- Bad, because 

## More Information

```
