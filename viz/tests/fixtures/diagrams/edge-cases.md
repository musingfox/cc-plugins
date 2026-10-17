# Diagram edge cases

A valid flowchart with a subgraph:

```mermaid
graph TD
    subgraph Frontend
        A[UI] --> B[State]
    end
    B --> C[API]
```

A truncated flowchart:

```mermaid
graph TD
 A -->
```

Text that is not a diagram:

```mermaid
hello world
```

A hostile label is drawn as text:

```mermaid
graph TD
    A[<img src=x onerror="window.__pwned=1">] --> B[ok]
```

A broken diagram with a hostile token:

```mermaid
graph TD
    A --> <img src=x onerror="window.__pwned=2">
```

The page keeps going after the broken fences.
