# Mermaid Diagram Types Reference

## 1. Flowchart / Graph

**Use for**: Process flows, decision trees, algorithms, workflows

```mermaid
graph TD
    Start[Start Node] --> Process[Process Step]
    Process --> Decision{Decision Point}
    Decision -->|Yes| Action1[Action 1]
    Decision -->|No| Action2[Action 2]
    Action1 --> End[End]
    Action2 --> End
```

**Direction options**: `TD` (top-down), `LR` (left-right), `BT` (bottom-top), `RL` (right-left)

**Node shapes**:
- `[Rectangle]` — standard process
- `(Rounded)` — start/end points
- `{Diamond}` — decisions
- `[[Subroutine]]` — predefined process
- `[(Database)]` — data storage

## 2. Sequence Diagram

**Use for**: API interactions, system communications, time-based flows

```mermaid
sequenceDiagram
    participant A as Actor A
    participant B as Actor B
    participant C as Actor C

    A->>B: Request
    B->>C: Query
    C-->>B: Response
    B-->>A: Result
```

## 3. Class Diagram

**Use for**: Object-oriented design, data models, entity relationships

```mermaid
classDiagram
    class Animal {
        +String name
        +int age
        +makeSound()
    }
    class Dog {
        +String breed
        +bark()
    }
    Animal <|-- Dog
```

## 4. State Diagram

**Use for**: State machines, workflow states, status transitions

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: Start
    Processing --> Complete: Success
    Processing --> Error: Failure
    Complete --> [*]
    Error --> Idle: Retry
```

## 5. Entity Relationship Diagram

**Use for**: Database schemas, data relationships

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
```

## 6. Gantt Chart

**Use for**: Project timelines, task scheduling

```mermaid
gantt
    title Project Schedule
    dateFormat  YYYY-MM-DD
    section Phase 1
    Design           :a1, 2024-01-01, 30d
    Development      :a2, after a1, 45d
```

## 7. Pie Chart

**Use for**: Data distribution, proportions

```mermaid
pie title Distribution
    "Category A" : 42
    "Category B" : 30
    "Category C" : 28
```

## Best Practices

**DO**:
- Use descriptive node labels (e.g., "User Authentication" not "Auth")
- Keep diagrams focused: 5-15 nodes optimal
- Use quotes for labels with spaces: `A["User Input"]`
- Use subgraphs to organize complex flowcharts
- Include meaningful arrow labels for decision branches

**DON'T**:
- Create overly complex diagrams (>20 nodes) — split into multiple
- Use very long text in labels (>30 chars) — breaks layout
- Use spaces in node IDs (use camelCase or underscores)
- Mix diagram types in a single chart

## Styling (Optional)

```mermaid
graph TD
    A[Normal] --> B[Important]
    style B fill:#f9f,stroke:#333,stroke-width:4px
```

## Subgraphs

```mermaid
graph TD
    subgraph Frontend
        A[UI] --> B[State]
    end
    subgraph Backend
        C[API] --> D[DB]
    end
    B --> C
```
