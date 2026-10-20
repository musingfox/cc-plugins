---
viz: feedback
title: Diagrams in the feedback page - a valid flowchart and broken syntax
panel: Your decision
prompt: tests/diagrams.e2e.ts uses this brief to check the feedback page's mermaid diagrams.
d1.title: What for lunch?
d1.options: Bento | Ramen | Salad
d1.recommend: Bento
d1.choice:
d1.notes:
notes:
---

## What for lunch?

| Option | Upside | Cost | Cost to reverse |
|---|---|---|---|
| Bento | Cheap; fast | Greasy | Low |
| Ramen | Tasty; hot | Queue; salty | Medium |
| Salad | Refreshing | Not filling | Low |

## Flow

```mermaid
graph TD
    Start[Start] --> Decide{Hungry?}
    Decide -->|yes| Eat[Eat]
```

## Broken diagram

```mermaid
graph TD
    A -->
```
