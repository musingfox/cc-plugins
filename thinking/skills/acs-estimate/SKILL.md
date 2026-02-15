---
name: acs-estimate
description: >-
  Activated when estimating task complexity, predicting AI failure risk, assessing how many
  human interventions a task will need, sizing work for agentic coding, or when the user
  asks to evaluate difficulty, effort, or risk of a coding task. Triggers on keywords like
  estimate, complexity, ACS, risk assessment, intervention count, task sizing.
---

# Agentic Complexity Score (ACS)

Quantify AI failure risk and predict required human intervention count for any coding task. ACS replaces time-based estimation with a metric that actually matters in agentic workflows: **how many times will the human need to step in?**

## Formula

```
ACS = Wt(Fh + 3Fv) + Wd(Estd + 5Epvt) + Wl(Smut + 2Bcond)
```

Default weights: `Wt = 1, Wd = 1, Wl = 1` (adjust per project if needed)

## Three Dimensions

### A. Context Topology (Wt)

How many files and layers does the task touch?

| Variable | Definition | How to Count |
|----------|-----------|--------------|
| **Fh** (horizontal fan-out) | Number of files modified at the same abstraction layer | Count files in the same directory/module that need changes |
| **Fv** (vertical fan-out) | Number of abstraction layers crossed | Count distinct layers: UI → API → service → DB = 4 layers |

**Multiplier**: Fv × 3 — crossing layers is 3× harder than touching parallel files, because each layer has different conventions, types, and failure modes.

### B. Dependency Cognitive Resistance (Wd)

How opaque are the dependencies?

| Variable | Definition | How to Count |
|----------|-----------|--------------|
| **Estd** (standard deps) | External dependencies with good docs/types | Count well-documented libraries (e.g., React, Express, lodash) |
| **Epvt** (private/opaque deps) | Internal or poorly-documented dependencies | Count internal packages, undocumented APIs, legacy modules |

**Multiplier**: Epvt × 5 — private dependencies have no public documentation for the AI to reference, causing hallucination and requiring human clarification.

### C. Generation Deduction Load (Wl)

How much state mutation and branching logic is involved?

| Variable | Definition | How to Count |
|----------|-----------|--------------|
| **Smut** (state mutations) | Distinct state changes the task introduces | Count new setState/store updates/DB writes |
| **Bcond** (conditional branches) | New conditional paths added | Count new if/else, switch cases, error handlers |

**Multiplier**: Bcond × 2 — each branch doubles the verification space the AI must reason about correctly.

## Intervention Tier Table

| Tier | ACS Range | Expected Interventions | Guidance |
|------|-----------|----------------------|----------|
| **L1 — Autonomous** | ≤ 10 | 0–1 | AI can handle with minimal oversight. Quick review at the end. |
| **L2 — Guided** | 11–25 | 2–4 | Plan review + mid-task check-in recommended. Use SDD staged approach. |
| **L3 — Collaborative** | > 25 | 5+ | Break into sub-tasks. Each sub-task should be L1 or L2. Human drives architecture. |

## Calculation Workflow

Follow these steps for every estimation:

### Step 1: Decompose the Task

List all files to be created or modified. Identify which abstraction layers are involved.

### Step 2: Count Variables

Fill in this table:

```
Context Topology:     Fh = ___  Fv = ___
Dependency Resistance: Estd = ___  Epvt = ___
Generation Load:      Smut = ___  Bcond = ___
```

### Step 3: Calculate ACS

```
ACS = (Fh + 3×Fv) + (Estd + 5×Epvt) + (Smut + 2×Bcond)
    = (___ + 3×___) + (___ + 5×___) + (___ + 2×___)
    = ___
```

### Step 4: Determine Tier and Recommendation

Map the score to L1/L2/L3 and provide actionable guidance.

### Step 5: Identify Risk Hotspots

List the top 2-3 variables contributing most to the score. These are where human attention should focus.

## Output Format

Present results using this template:

```markdown
## ACS Assessment: [Task Name]

| Dimension | Variables | Subtotal |
|-----------|----------|----------|
| Context Topology | Fh=X, Fv=Y | X + 3×Y = Z |
| Dependency Resistance | Estd=X, Epvt=Y | X + 5×Y = Z |
| Generation Load | Smut=X, Bcond=Y | X + 2×Y = Z |
| **Total ACS** | | **Z** |

**Tier**: L[1/2/3] — [Autonomous/Guided/Collaborative]
**Expected interventions**: N

### Risk Hotspots
1. [Highest contributor and why]
2. [Second highest and why]

### Recommendation
[How to approach this task given the tier]
```

## Post-Task Recording

After completing the task, record in MEMORY:

```
- Task: [name] | ACS estimated: [X] (L[tier]) | Actual interventions: [N] | Notes: [any calibration insight]
```
