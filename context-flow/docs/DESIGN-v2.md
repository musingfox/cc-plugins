# Context Flow v2 — Design Document

## Core Principle

**Agent = Context + Goal + Tools**

An agent is NOT defined by a role. It is defined by:
- **Context**: what information it receives (and what it does NOT receive)
- **Goal**: what output it must produce
- **Tools**: what actions it can take

Everything in this system is connected by **contracts**. A contract defines the input an agent receives and the output it must deliver. The five roles each have one job regarding contracts: the orchestrator routes them, research investigates to inform them, plan defines them, implement fulfills them, and review verifies them.

---

## Roles

| Role | Contract Responsibility |
|------|------------------------|
| **Orchestrator** | **Operates the flow** — assembles each agent's input context, validates output sufficiency, provides opinionated decision support to the human |
| **Research** | **Investigates** the codebase to produce the factual basis for writing correct contracts |
| **Plan** | **Defines** complete contracts with decision tiering |
| **Implement** | **Fulfills** contracts faithfully — delivers working code and passing tests |
| **Review** | **Verifies** contracts are satisfied AND flags non-contract concerns as advisories |

### Orchestrator: Collaborative Flow Operator

The orchestrator is not a simple router. It is the **human's collaborative partner** in managing the flow. Its core function is to ensure human cognitive bandwidth is spent only on the most critical decisions.

What the orchestrator does:

1. **Assembles input context** — gathers exactly the information the next agent needs; compresses upstream outputs to preserve signal and discard noise (see Context Compression below)
2. **Validates output** — checks both structural completeness and semantic sufficiency
3. **Provides opinionated decision support** — when presenting decisions to the human, the orchestrator offers its own analysis and recommendations, not just a list of items to approve
4. **Manages escalation** — when agents cannot resolve issues, the orchestrator packages the situation with context, analysis, and suggested options for the human

What the orchestrator does NOT do:

- Override human decisions
- Make architectural or design choices unilaterally
- Bypass the human gate for High/Medium decisions

The orchestrator is the most intelligent component in the system. It requires judgment to evaluate semantic sufficiency, assess decision impact, and determine when to escalate. This is by design — the orchestrator's intelligence serves to reduce the cognitive load on the human, not to replace human judgment.

#### Context Compression

When assembling input for the next phase, the orchestrator compresses upstream outputs, not forwards them verbatim. Compression rules:

- **Preserve**: concrete facts (file paths, types, evidence), decisions with their outcomes, constraints with their evidence, test cases with concrete values
- **Discard**: investigation process details, rejected alternatives' full analysis (keep only names), verbose explanations of things the next agent doesn't need
- **Reshape**: adapt the information structure to match what the receiving agent needs, not what the producing agent generated

The goal is that each agent receives the **minimum sufficient context** to do its job. Compression is a judgment call — the orchestrator errs on the side of including too much rather than too little, because missing context causes loop-backs (expensive) while extra context merely wastes some input tokens (cheap).

---

## Flow Graph

This is NOT a linear pipeline. It is a flow graph where every transition is guarded by the orchestrator.

```
[research — Agent Teams] ⟶ orch ⟶ [plan] ⟶ orch ⟶ human gate (H/M only)
        ↕                     ↕                          ↓
    human/redo            human/redo              [implement (parallel if independent)]
                                                         ↓
                                                 orch ⟶ [review — Agent Teams]
                                                     ↕        ↕
                                                 human/redo  human/redo
```

At each transition, the orchestrator evaluates:

> **Is this output sufficient as input for the next phase?**

- Sufficient → assemble the next agent's input context, dispatch
- Insufficient (needs codebase investigation) → loop back to research with enriched goal
- Insufficient (needs human input) → present the gap with analysis and recommendation, then re-route after human responds
- Structurally invalid → feedback to the same agent, re-run

---

## Agent Teams as Default

Research and Review phases use **Agent Teams by default**. This replaces the previous ACS complexity gating.

### Rationale

The previous design used heuristic rules (ACS) to decide whether to trigger Agent Teams after research. This added a decision layer that was often wrong in both directions — missing complexity on subtle goals, triggering unnecessarily on keyword-heavy simple goals. Making Agent Teams the default for research and review:

1. **Eliminates a decision point** — no ACS heuristic to maintain or debug
2. **Multi-perspective exploration is almost always valuable** — even for moderate goals, a second angle catches blind spots
3. **Matches official guidance** — Agent Teams docs recommend starting with research and review use cases
4. **Cost is bounded** — 2-3 teammates per phase, not open-ended

### Skip Conditions

Agent Teams is skipped (single agent used instead) when:
- User explicitly requested a fast path in the goal
- Goal is clearly a single-file bugfix, typo fix, or documentation-only change
- Goal can be fully described in one sentence with no ambiguity

### Mode Selection

- If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set → **native Agent Teams** (teammates communicate directly, challenge findings, converge on shared conclusions)
- Otherwise → **subagent parallel exploration** (parallel Agent dispatch, orchestrator synthesizes)

Native mode produces higher-quality results because teammates can cross-reference findings and debate. Subagent mode is the fallback when the experimental feature is not available.

### Re-run Budget

- Max **1 re-run** per Agent Teams phase (research or review)
- After limit → escalate to human

### How Research Feeds into Plan

The Plan agent receives:
- **Compressed research** (synthesized capability inventory from research team)
- **Divergence and human direction** (if research teammates found conflicting facts and human chose a direction)

The direction document does NOT dictate contracts — it provides context for the Plan agent to make informed architectural decisions. The Plan agent is still responsible for defining the complete contracts; the direction document reduces the chance of overlooking key constraints or viable alternatives.

---

## Agent Output Format

Every agent's output MUST include a completion declaration with confidence levels:

```markdown
## Completed
- [What was accomplished] [confidence: high | medium]
  - high: verified against evidence, no assumptions
  - medium: reasonable assumptions made, stated explicitly

## Unresolved
- [What could not be determined]
  - [Why it's unresolved]
  - [What would be needed to resolve it]
  - [Suggested resolution path, if any]
```

Rules:
- An agent that reports everything as "Completed: high" when ambiguity clearly exists has produced an invalid output.
- A "Completed: medium" item must state its assumption explicitly — the orchestrator may decide the assumption is too risky and treat it as Unresolved.
- Every Unresolved item must include a suggested resolution path. Agents don't just report problems — they provide decision support.
- **There is no "low" confidence.** If an agent's confidence is low — meaning it is guessing rather than reasoning from evidence — the item belongs in Unresolved, not Completed. The boundary is: "medium" means a defensible assumption was made; anything below that is unresolved.

---

## Contract Structure

Contracts are split into two layers:

### Behavioral Contracts

Define **what** the system must do. These are the binding agreements that implement fulfills and review verifies.

```markdown
### [Contract Name]
- **input**: [exact types/parameters]
- **output**: [exact return types]
- **errors**: [error conditions and handling]
- **depends**: [other contracts this depends on]

#### Test Cases
- input [concrete value] → expected [concrete value]
```

Behavioral contracts define **interfaces and behavior**, not file paths or implementation details. If an implement agent needs to split one contract across two files, that's fine — the contract is still satisfied as long as the tests pass.

### Implementation Plan

Defines **how** and **where** to implement. This is guidance for the implement agent, not a binding contract.

```markdown
## Implementation Plan
### [Step N]: [Description] — fulfills [Contract Name]
- **target**: [file path to create or modify]
- **approach**: [brief implementation strategy]
- **order**: [dependencies on other steps]
```

The implement agent may deviate from the implementation plan (different files, different internal structure) as long as all behavioral contracts are satisfied. The review phase verifies behavioral contracts, not implementation plan adherence.

### What Is NOT a Contract

Operations that have no meaningful input/output interface (database migrations, config changes, file moves) are listed in the Implementation Plan, not as behavioral contracts. They are prerequisites, not interfaces.

---

## Agent Selection

The flow defines **contracts**, not specific agents. Any agent that accepts a phase's input contract and produces the required output contract can be dispatched.

For example, an `implement` phase contract could be fulfilled by:
- The default `implement` agent (general-purpose)
- A `frontend-dev` agent (if the contracts are UI-focused)
- A specialized `database-migration` agent (if the contracts are schema changes)

The orchestrator maintains a registry of available agents and their capabilities. Agent selection is based on matching the phase's contract requirements to agent capabilities — this is a simple lookup, not a complex decision. If no specialized agent matches, the default agent for that phase is used.

---

## Phase Details

### Phase 1: Research

**Input Context**:
- User's goal
- Working directory
- (If looping back) Enriched goal with context from the triggering phase

**Output Contract**:
```markdown
## Existing Capabilities
- `[file path]`: [what it does] — [relevant interfaces/exports]

## Relevant Patterns
- [pattern name]: [where used] — [how it works]

## Constraints
- [constraint]: [evidence from code]

## Key Files
- `[file path]`: [why it matters for this goal]

## Completed
- [What aspects of the goal were fully investigated] [confidence: high | medium]

## Unresolved
- [What could not be determined from the codebase alone]
  - [Suggested resolution: e.g., "ask human about expected data volume"]
```

**Orchestrator validates before passing to Plan**:
- "Existing Capabilities" has file paths with evidence
- "Constraints" has entries backed by code evidence
- Unresolved items are assessed: would any of them prevent the plan agent from defining correct contracts? If yes → consult human with the orchestrator's own analysis of why it matters and what the options are

---

### Phase 2: Plan

**Input Context**:
- Compressed goal (1-2 sentences)
- Research output
- Human clarifications (if any, from previous orchestrator-human exchange)
- Contract requirements: "Every behavioral contract must have test cases with concrete input → expected output"

**Output Contract**:
```markdown
## Decisions

### [Decision Title]
- **Impact**: High | Medium | Low
- **Choice**: [What was decided]
- **Alternatives considered**: [What else was possible and why it was rejected]
- **Rationale**: [Why this choice]

## Behavioral Contracts

### [Contract Name]
- **input**: [exact types/parameters]
- **output**: [exact return types]
- **errors**: [error conditions and handling]
- **depends**: [other contracts this depends on]

#### Test Cases
- input [concrete value] → expected [concrete value]

## Implementation Plan
### Step 1: [Description] — fulfills [Contract Name]
- **target**: [file path]
- **approach**: [brief strategy]

## Completed
- [Which research constraints are addressed by contracts] [confidence: high | medium]

## Unresolved
- [Decisions that require human input]
  - [Suggested resolution path]
```

**Decision Tiering**:

| Impact | Criteria | Human Gate |
|--------|----------|-----------|
| **High** | Irreversible, architectural, cross-module, introduces new dependencies, changes tech stack | Required |
| **Medium** | Multiple valid approaches, affects UX behavior, performance trade-offs | Required |
| **Low** | Implementation detail, single-file scope, easily changeable later | Auto-approve |

**Structural Minimum Rules** — the orchestrator enforces these mechanically, regardless of plan agent's classification:

| Condition | Minimum Impact |
|-----------|---------------|
| Introduces a new external dependency | ≥ High |
| Modifies an existing public API/interface | ≥ High |
| Irreversible operation (migration, data deletion, schema drop) | ≥ High |
| Changes affect ≥ 3 files | ≥ Medium |
| ≥ 2 viable alternatives exist and were considered | ≥ Medium |

If the plan agent classifies a decision below the structural minimum, the orchestrator **automatically upgrades** it. This prevents strategic under-classification and does not require judgment — it is a deterministic check.

**Orchestrator validates before Human Gate**:
- Every research constraint is addressed by at least one contract **test case** or explicitly acknowledged in Unresolved with justification. Constraints that are not captured as test cases are considered unverifiable — the plan must either add a test or explain why the constraint is not testable.
- Every behavioral contract has at least one test case with concrete values
- Every decision has an impact level assigned and passes structural minimum rules
- Unresolved items are assessed for blocking potential

**Human Gate**:

The orchestrator presents High and Medium decisions with **its own opinion**:

> **[High] Streaming Architecture**
> Plan proposes: Transform stream with 1000-row chunks.
> Alternative considered: In-memory buffering (~20MB).
> **Orch assessment**: I recommend approving. The streaming pattern already exists in `revenue-export.ts`, so this adds no new complexity. In-memory would work today but creates a scaling cliff.

This is not a rubber-stamp checklist. The orchestrator highlights what matters, explains trade-offs in accessible terms, and states its recommendation. The human can: approve all / revise specific decisions / request more research / abort.

The plan phase is **iterative**. The human may approve some decisions, reject others, and request changes — the plan agent re-runs with updated context until all High/Medium decisions are approved.

---

### Phase 3: Implement

**Input Context**:
- Behavioral contracts (extracted from plan)
- Test cases (extracted from plan)
- Implementation plan (as guidance, not binding)
- Context summary (read-only):

```markdown
## Context Summary
- **Goal**: [one-line compressed goal from orchestrator]
- **Key constraints**: [constraints from research that affect implementation]
```

The context summary provides directional awareness without exposing decision rationale or alternatives. It exists so the implement agent can make reasonable micro-decisions (naming, error messages, code organization) without needing to report Unresolved for every trivial ambiguity.

The implement agent does NOT receive: full research output, decision alternatives, planning rationale, or rejected approaches. These are deliberately withheld to prevent the implement agent from second-guessing approved contracts.

#### Contract Independence and Parallel Dispatch

Before dispatching implement agents, the orchestrator **analyzes contract dependencies** to determine if parallel execution is viable.

**Dependency Graph Construction**:

For each behavioral contract, the orchestrator checks:
1. **Explicit dependencies**: the `depends` field in the contract definition
2. **File overlap**: whether two contracts target the same file in their implementation plan steps
3. **Test interdependency**: whether one contract's test cases import or invoke another contract's output

Contracts are grouped into **independent execution groups** if:
- No explicit dependency between them
- No file path overlap (or overlapping files are marked as append-only/non-conflicting by the plan)
- Test cases are self-contained (mocks/stubs for external dependencies)

**Parallel Dispatch Rules**:

- **Independent groups** → spawn separate implement agents in parallel, each with their own worktree (git worktree mechanism to avoid conflicts)
- **Sequential groups** → queue for serial execution (dependencies must be satisfied first)
- **Maximum concurrency**: 3 implement agents (budget constraint to avoid exponential token usage)

Each parallel implement agent receives:
- Only the contracts in its group
- Only the test cases for its group
- Implementation plan filtered to its group's steps
- Shared context summary (same for all agents)

After all parallel agents complete, the orchestrator:
1. **Merges worktrees** back to main working tree
2. **Runs integration tests** (if the plan defined any cross-contract tests)
3. **Proceeds to review** with the merged diff

**When Parallel Dispatch is NOT Used**:

- Fewer than 2 independent contract groups → no parallelization benefit
- Plan explicitly marks contracts as "must be sequential" (e.g., database migration must precede schema-dependent code)
- Human overrides with `--no-parallel` flag (debugging, prefer simpler flow)

**Output Contract**:
```markdown
## Completed
- [Which contracts were implemented] [confidence: high]
- [Which test cases pass]

## Concerns
- [Contract Name]: [what was implemented but has risks]
  - [What the concern is]
  - [Why it's technically feasible but problematic]

## Unresolved
- [Which contracts could not be implemented and why]
  - [Specific technical obstacle]
  - [What was attempted]
```

**Implement Agent Behavioral Boundary**:

The implement agent **faithfully executes contracts**. It has three valid outcomes per contract:

1. **Completed**: contract implemented, tests pass, no concerns
2. **Completed with Concerns**: contract implemented and tests pass, but the implement agent observes a risk (fragile adaptation, performance cliff, type safety gap, etc.). The concern is logged but does NOT block the flow — it is forwarded to review as input.
3. **Unresolved**: contract is **technically infeasible** given the current codebase state (API doesn't exist, type system conflict, dependency version incompatible, etc.)

The implement agent does NOT:
- Question whether a contract is the right approach
- Suggest alternative designs
- Refuse to implement a feasible contract because it considers it suboptimal
- Optimize beyond what the contract requires

If a contract is technically feasible but the implement agent believes it produces brittle or risky code, it implements it **and logs a Concern**. Design judgment is the plan phase's responsibility; the implement agent's role is faithful execution with transparent risk reporting.

**Orchestrator validates before passing to Review**:
- All test cases pass (actually executed)
- Concerns are forwarded to the review agent as additional input
- If any contracts are Unresolved:
  - Technical obstacle that needs codebase investigation → loop back to research with the obstacle as enriched goal
  - Missing information from plan → consult human with analysis
  - All contracts Unresolved → escalate to human (see Failure Conditions)

---

### Phase 4: Review

**Input Context**:
- Behavioral contracts (same as Phase 3)
- Test cases (same as Phase 3)
- Implement agent's Concerns (if any)
- Git diff of all changes

Note: the review agent does NOT receive research constraints directly. The plan phase is responsible for converting research constraints into contract test cases. If a constraint wasn't captured as a test case, that is a plan quality issue — the review phase verifies contracts as-written, not whether the right contracts were written.

**Output Contract**:
```markdown
## Contract Verification

### [Contract Name]
- **Status**: PASS | FAIL
- **Evidence**: [How the implementation satisfies or violates the contract]

## Advisories

### [Advisory Title]
- **Category**: security | performance | maintainability | correctness
- **Severity**: critical | warning | info
- **Detail**: [What was observed and why it matters]

## Completed
- [Which contracts were verified] [confidence: high | medium]

## Unresolved
- [Unexpected behaviors discovered]
  - [Evidence and suggested resolution]

## Verdict
APPROVE | REQUEST_CHANGES
```

The review phase has two scopes:

1. **Contract compliance** (binding): Does the implementation satisfy every behavioral contract? PASS/FAIL per contract. This determines the verdict.
2. **Advisories** (non-binding): Observations about code quality, security, performance, or other concerns not covered by contracts. Implement agent Concerns are reviewed here and may be escalated to advisories with the review agent's own assessment. Critical advisories are highlighted but do not block the flow.

**Orchestrator handles verdict**:
- APPROVE, no Unresolved, no critical advisories → done, present summary
- APPROVE with advisories → present advisories to human, ask if acceptable or should address
- REQUEST_CHANGES with clear contract failures → re-run implement with failure details
- REQUEST_CHANGES with fundamental design issues → loop back to plan or research

---

## Loop Back Mechanism

Any phase can trigger a loop back. The mechanism:

1. An agent's output contains Unresolved items or the orchestrator judges the output insufficient for the next phase
2. The orchestrator determines what's needed:
   - **Codebase investigation** → loop to research with enriched goal
   - **Human decision** → present with analysis and recommendation
   - **Structural fix in current phase** → re-run with feedback
3. When looping to research, the orchestrator enriches the goal:

```markdown
## Goal
[Original goal]

## Additional Context
[What was attempted in Phase X]
[What specific obstacle was encountered]
[What the next phase needs to proceed]
```

The research agent doesn't know it's in a "loop" — it just sees a more specific goal.

### Loop Limits

Loop-backs are counted in two categories:

1. **Phase re-runs**: the same phase is re-run with feedback (e.g., orchestrator asks research to go deeper on a specific area). Limit: **2 per phase**.
2. **Cross-phase loops**: flow returns to an earlier phase (e.g., implement → research → plan → implement). Limit: **2 total** across the entire flow.

The distinction matters because a phase re-run is cheap (same agent, refined prompt) while a cross-phase loop is expensive (multiple agents re-run, potential human gates re-triggered).

When any limit is reached, the orchestrator:
1. Presents the full situation to the human: what was attempted, what failed, what options remain
2. Provides its assessment and recommendation
3. Asks the human to: provide guidance and continue / simplify the goal / abort

The human can override limits. The limits exist to force a check-in, not to hard-stop the flow.

---

## Failure Conditions and Graceful Degradation

### Explicit Failure Triggers

| Condition | Orchestrator Action |
|-----------|-------------------|
| Research finds nothing relevant to the goal | Escalate: "The codebase doesn't appear to have anything related to this goal. Should we start from scratch, or is this the wrong codebase?" |
| Plan's High decisions are all rejected by human | Escalate: "All proposed approaches were rejected. Would you like to provide direction, or should we research alternative approaches?" |
| All of implement's contracts are Unresolved | Escalate: "Implementation is blocked on all fronts. Here's what was attempted and why it failed. Options: re-scope, revise contracts, or abort." |
| Review finds all contracts FAIL | Loop back to implement (1st time) or escalate (2nd time): "Implementation doesn't satisfy the contracts even after retry." |
| Loop limit reached on any phase | Escalate with full context and recommendation |

### Escalation Format

Every escalation to the human follows this structure:

```markdown
## Situation
[What happened — factual, concise]

## What Was Attempted
[Which phases ran, what they produced, what went wrong]

## Analysis
[Orchestrator's assessment of why this is stuck]

## Options
1. [Option A]: [description, trade-offs]
   - **Re-entry**: [where the flow resumes if this option is chosen]
2. [Option B]: [description, trade-offs]
   - **Re-entry**: [where the flow resumes if this option is chosen]
3. Abort: [what has been accomplished so far, if anything]

## Recommendation
[Orchestrator's suggested path forward and why]
```

### Escalation Re-entry Rules

When the human chooses an escalation option, the orchestrator must determine where the flow re-enters. The principle: **re-enter at the earliest phase that is invalidated by the change**.

| Type of Change | Re-entry Point |
|---------------|---------------|
| Human provides missing information only (no design change) | Re-run the phase that was stuck, with the new information added to its input |
| Human revises a Low-impact decision | Re-run from implement with updated contracts |
| Human revises a Medium/High-impact decision | Re-run from plan (to redefine contracts), then through human gate again for the revised decision |
| Human changes the goal or scope | Re-run from research with the revised goal |
| Human provides a completely new approach | Re-run from plan with the new approach as a constraint, skip research if codebase facts haven't changed |

### The Escape Hatch Principle

Every agent follows the same degradation pattern:

1. **Try to solve it** — within the contract's scope
2. **If stuck, provide decision support** — don't just report the problem; analyze it, suggest options, state a recommendation
3. **Escalate as last resort** — package the full situation so the human can make an informed decision without re-investigating

Agents never silently fail. Agents never dump raw problems on the human without analysis. The goal is that when a human is pulled in, they can make a decision in minutes, not hours.

---

## Concrete Examples

### Example 1: Smooth Flow — "Add transaction history export to CSV"

#### Phase 1: Research

**Orchestrator assembles input**:
```markdown
## Goal
Add transaction history export to CSV for the billing module

## Scope
Working directory: /app
```

**Research agent output**:
```markdown
## Existing Capabilities
- `src/billing/transactions.ts`: Transaction model with `list()`, `getById()` — returns `Transaction[]`
- `src/billing/types.ts`: `Transaction { id, amount, currency, status, createdAt, metadata }`
- `src/utils/csv.ts`: Generic CSV writer, `toCsv(headers: string[], rows: string[][]): string`

## Relevant Patterns
- Export pattern: `src/reports/revenue-export.ts` uses streaming for large datasets
- API pattern: all billing endpoints use `src/billing/router.ts` with auth middleware

## Constraints
- Transaction table has no index on `createdAt` — large date range queries will be slow [evidence: schema.prisma L142]
- Existing CSV utility does not handle Unicode in metadata fields [evidence: csv.ts L28, no encoding specified]
- Rate limiting: billing API has 100 req/min limit [evidence: router.ts L12]

## Key Files
- `src/billing/transactions.ts`: Core transaction queries
- `src/billing/router.ts`: Where the endpoint will be added
- `src/utils/csv.ts`: CSV generation utility

## Completed
- Identified transaction data model and query interface [confidence: high]
- Found existing CSV utility and export patterns [confidence: high]
- Identified performance and encoding constraints [confidence: high]

## Unresolved
- Transaction volume is unknown — determines streaming vs in-memory approach
  - Suggested resolution: ask human about expected volume per account
- Metadata field inclusion not specified
  - Suggested resolution: ask human — core fields only, or include metadata?
- Currency formatting not specified
  - Suggested resolution: ask human — raw numbers or locale-formatted?
```

#### Orchestrator Transition (Research → Plan)

Orchestrator assesses: all three Unresolved items affect contract design. Volume determines architecture (streaming vs buffer). Field selection determines interface. These cannot be assumed.

**Orchestrator to human**:

> Research is complete. Three questions need your input before I can move to planning:
>
> 1. **Transaction volume per account?** This determines the export architecture. If under ~10k records, a simple in-memory approach works. Above that, streaming is safer — the codebase already has a streaming export pattern in `revenue-export.ts` we could follow.
> 2. **Which fields to export?** Core fields (id, amount, currency, status, date) or also include the metadata column?
> 3. **Currency format?** Raw numbers (1234.56) for machine consumption, or locale-formatted ($1,234.56) for human readability?

**Human**: 100k per account, streaming. Core fields only. Raw numbers.

The answers don't require new codebase investigation (streaming pattern already found). Orchestrator proceeds to plan.

---

#### Phase 2: Plan

**Orchestrator assembles input**:
```markdown
## Goal
Add streaming transaction history CSV export for billing. Up to 100k rows. Core fields only. Raw numbers.

## Codebase Research
[research output]

## Human Clarifications
- Volume: up to 100k → streaming required
- Fields: core only (id, amount, currency, status, createdAt)
- Currency: raw numbers
```

**Plan agent output** (abbreviated — contracts are behavioral-only):

```markdown
## Decisions

### 1. Streaming Architecture
- **Impact**: High
- **Choice**: Node.js Transform stream, chunked processing (1000 rows/chunk)
- **Alternatives**: In-memory buffering (~20MB, works but scaling cliff); third-party lib (unnecessary complexity)
- **Rationale**: Existing pattern in revenue-export.ts

### 2. Endpoint Design
- **Impact**: Medium
- **Choice**: GET /api/billing/transactions/export?from=&to=&format=csv
- **Alternatives**: POST (wrong semantics for export); /api/exports namespace (over-abstraction)
- **Rationale**: REST conventions, extensible format param

### 3. Date Range Handling
- **Impact**: Medium
- **Choice**: Required from/to params, max 1 year, add createdAt index
- **Alternatives**: Optional params defaulting to 30 days (dangerous on 100k+ rows)
- **Rationale**: Addresses missing index constraint; bounded queries

### 4. CSV Header Naming
- **Impact**: Low
- **Choice**: snake_case: id,amount,currency,status,created_at
- **Rationale**: Machine-readable

## Behavioral Contracts

### StreamingCsvExport
- **input**: `{ accountId: string, from: Date, to: Date }`
- **output**: `ReadableStream<string>` — CSV with header row first, then data rows in chunks
- **errors**: `InvalidDateRange` (from > to or range > 1 year), `AccountNotFound`
- **depends**: TransactionQuery

#### Test Cases
- { accountId: "acc_1", from: 2025-01-01, to: 2025-01-31 } with 3 txns → CSV header + 3 rows
- { accountId: "acc_1", from: 2025-01-01, to: 2026-06-01 } → InvalidDateRange
- { accountId: "nonexistent", ... } → AccountNotFound
- 0 transactions in range → CSV header only

### TransactionQuery
- **input**: `{ accountId: string, from: Date, to: Date, cursor?: string, limit: number }`
- **output**: `{ transactions: Transaction[], nextCursor: string | null }`
- **errors**: `AccountNotFound`
- **depends**: none

#### Test Cases
- { accountId: "acc_1", ..., limit: 2 } with 3 txns → 2 txns + non-null cursor
- Same with cursor → 1 txn + null cursor

### ExportEndpoint
- **input**: `GET /api/billing/transactions/export?from=ISO&to=ISO&format=csv`
- **output**: 200 with Content-Type: text/csv, Content-Disposition: attachment, streaming body
- **errors**: 400 (missing/invalid params), 404 (unknown account), 429 (rate limit)
- **depends**: StreamingCsvExport

#### Test Cases
- Valid params → 200 + CSV headers
- Missing `from` → 400
- format=json → 400 (unsupported)
- Constraint verification: EXPLAIN query on date range → index scan (verifies createdAt index exists)

## Implementation Plan
### Step 1: Add createdAt index — prerequisite
- **target**: prisma/migrations/
- **approach**: CREATE INDEX on transactions.createdAt

### Step 2: Cursor-based query — fulfills TransactionQuery
- **target**: src/billing/transactions.ts (modify)
- **approach**: Add listPaginated() using Prisma cursor

### Step 3: Streaming CSV generator — fulfills StreamingCsvExport
- **target**: src/billing/csv-export.ts (new)
- **approach**: Transform stream wrapping TransactionQuery pagination

### Step 4: Export endpoint — fulfills ExportEndpoint
- **target**: src/billing/router.ts (modify)
- **approach**: GET route with param validation, pipes StreamingCsvExport

## Completed
- All 3 research constraints addressed [confidence: high]
  - Missing index → Step 1 + test case verifying index scan
  - Unicode → excluded metadata (human decision), core fields are ASCII-safe
  - Rate limiting → inherits existing middleware

## Unresolved
- None
```

#### Orchestrator → Human Gate

Orchestrator verifies structural minimum rules:
- Decision 1 (Streaming Architecture): architectural → High ✓ (matches plan's classification)
- Decision 2 (Endpoint Design): Medium ✓
- Decision 3 (Date Range): plan says Medium, but includes an irreversible migration (CREATE INDEX) → structural minimum says ≥ High → **auto-upgrade to High**
- Decision 4 (CSV Headers): Low ✓

**Orchestrator to human**:

> Plan complete. Decisions for your approval:
>
> **[High] Streaming Architecture** — Transform stream, 1000-row chunks.
> *My take*: Recommend approving. The pattern already exists in revenue-export.ts, so no new complexity. In-memory is viable for current volume (~20MB) but creates a cliff if volume grows.
>
> **[High ↑ auto-upgraded from Medium] Date Range + DB Index** — Required from/to, max 1 year, add DB index.
> *My take*: The index migration is irreversible, which triggered the auto-upgrade. I still recommend approving — queries on unindexed createdAt will degrade badly at 100k rows, and the index has no downside.
>
> **[Medium] Endpoint Design** — `GET /api/billing/transactions/export?from=&to=&format=csv`
> *My take*: Standard REST export pattern. The `format` param costs nothing and leaves room for JSON/PDF later.
>
> 3 behavioral contracts, 10 test cases. Approve / Revise / Abort?

**Human**: Approve all.

---

#### Phase 3: Implement

**Orchestrator assembles input** — behavioral contracts + test cases + implementation plan + context summary:

```markdown
## Context Summary
- **Goal**: Streaming CSV export for billing transactions
- **Key constraints**: No createdAt index exists yet (migration needed first); existing csv.ts is sync-only; rate limit 100 req/min applies

## Behavioral Contracts
[StreamingCsvExport, TransactionQuery, ExportEndpoint — full definitions]

## Test Cases
[All 10 test cases]

## Implementation Plan
[Steps 1-4 as guidance]
```

Note: no decision rationale, no alternatives, no research process details.

Implement agent delivers: all contracts fulfilled, all tests pass, no concerns.

---

#### Phase 4: Review

**Orchestrator assembles input** — behavioral contracts + test cases + git diff. No research constraints (those were captured as test cases by plan).

**Review agent output**:
```markdown
## Contract Verification
- StreamingCsvExport: PASS — Transform stream, header first, chunked rows
- TransactionQuery: PASS — cursor-based pagination, correct types
- ExportEndpoint: PASS — params validated, correct status codes and headers

## Advisories

### Missing error logging on stream failure
- **Category**: maintainability
- **Severity**: warning
- **Detail**: csv-export.ts Transform stream has no error event handler. If the DB cursor fails mid-stream, the response will hang. Consider adding .on('error') to pipe the error to the HTTP response.

## Completed
- All 3 contracts verified [confidence: high]

## Unresolved
- None

## Verdict
APPROVE
```

**Orchestrator to human**:

> Review passed. All 3 contracts satisfied.
>
> One advisory (non-blocking): the streaming CSV transform doesn't handle mid-stream DB errors — could cause hung responses. Severity: warning. Want to address this before we're done, or accept as-is?

---

### Example 2: Loop Back — Implement Hits Infeasibility

Same project. Implement agent encounters an obstacle:

```markdown
## Completed
- TransactionQuery: cursor-based pagination ✓ [confidence: high]

## Concerns
- None

## Unresolved
- StreamingCsvExport: Cannot implement as designed.
  - The existing csv.ts uses synchronous Array.join() and is imported by 4 other modules.
  - Creating a Transform stream wrapper around it would buffer entire chunks, defeating streaming.
  - What was attempted: tried wrapping toCsv() in a Transform — produced correct output but peak memory was identical to in-memory approach.
  - Suggested resolution: investigate whether csv.ts can be refactored to support streaming, or create a standalone streaming CSV writer for this use case.
- ExportEndpoint: blocked by StreamingCsvExport
```

**Orchestrator assesses**: This is a legitimate technical infeasibility — the implement agent tried and demonstrated why it doesn't work. The obstacle is in existing code structure, which needs codebase investigation.

**Orchestrator loops back to research** with enriched goal:

```markdown
## Goal
Determine how to implement streaming CSV generation for the billing export.

## Additional Context
The existing src/utils/csv.ts uses synchronous Array.join() and is imported by 4 modules.
Wrapping it in a Transform stream was attempted — correct output but no memory benefit.

Investigate:
1. Which modules import csv.ts? Can it be safely refactored for streaming?
2. If refactoring is too risky, is a standalone streaming CSV writer the better path?
```

Research runs → plan may revise just the StreamingCsvExport contract → human gate (if the revised approach is a different Impact level) → implement again.

---

### Example 3: Escalation — Loop Limit Reached

After 2 cross-phase loops on the implement phase, the streaming approach still fails due to a deep compatibility issue in the ORM layer.

**Orchestrator escalates**:

> ## Situation
> Implementation of StreamingCsvExport has failed after 2 cross-phase loops. The cursor-based pagination approach conflicts with Prisma's connection pooling — streaming a cursor across multiple chunks requires holding a connection, but the pool recycles connections between queries.
>
> ## What Was Attempted
> 1. First attempt: Transform stream + Prisma cursor → connection recycled mid-stream, data corruption
> 2. Loop back to research: investigated Prisma's `$queryRawUnsafe` for manual cursor — works but bypasses all type safety and model validation
> 3. Second attempt: raw SQL cursor → works but loses Prisma's `Transaction` type mapping, test cases fail on type assertions
>
> ## Analysis
> The root conflict is between Prisma's connection pooling model and long-lived cursors. This is a known Prisma limitation. Solving it properly would require either switching ORM (massive scope change) or accepting raw SQL for this specific query.
>
> ## Options
> 1. **Accept raw SQL for export query**: Works today, bypasses Prisma types for this one query. Risk: type drift if Transaction model changes. Mitigation: add a runtime type assertion.
>    - **Re-entry**: Back to plan — revise StreamingCsvExport contract to allow raw SQL return type, human gate for revised High decision, then implement
> 2. **Switch to in-memory approach**: Abandon streaming. 100k × 200 bytes ≈ 20MB peak memory per request. Rate limiting keeps concurrent exports low. Simpler to implement.
>    - **Re-entry**: Back to plan — redefine StreamingCsvExport as InMemoryCsvExport with new contract, human gate (this reverses a High decision), then implement
> 3. **Abort and re-scope**: Drop the export feature, or limit to smaller accounts first.
>    - **Re-entry**: None — flow terminates with partial work preserved
>
> ## Recommendation
> Option 2. The original streaming decision was made for future-proofing, but the Prisma constraint makes it costly. 20MB per request with rate limiting (100 req/min) is acceptable for current scale. If volume grows beyond 100k, this decision can be revisited with a different data access layer.

---

### Example 4: Agent Teams Flow — "Rewrite Auth Middleware for OAuth2"

This example demonstrates Agent Teams in research phase for a complex, ambiguous goal.

#### Phase 1: Research

**Orchestrator assembles input**:
```markdown
## Goal
Rewrite authentication middleware to support OAuth2 with PKCE flow for the API gateway

## Scope
Working directory: /app
```

**Research agent output**:
```markdown
## Existing Capabilities
- `src/auth/middleware.ts`: JWT-based auth, validates `Authorization: Bearer <token>` — no OAuth2 support
- `src/auth/jwt.ts`: Issues JWT tokens after password login — short-lived (1h), no refresh mechanism
- `src/gateway/router.ts`: All routes protected by auth middleware

## Relevant Patterns
- No OAuth2 precedent in the codebase
- External auth provider pattern: payment webhook uses HMAC signature validation (different paradigm)

## Constraints
- Existing auth uses synchronous JWT verification (jsonwebtoken.verify) — OAuth2 introspection is async
- 12 routes currently depend on `req.user` object populated by middleware — interface contract unclear
- Frontend expects `Set-Cookie` for session management — OAuth2 tokens typically use Authorization header

## Key Files
- `src/auth/middleware.ts`: Current auth middleware
- `src/auth/jwt.ts`: Token issuance
- `src/gateway/router.ts`: Route definitions
- `src/types/express.d.ts`: Express Request type extension
- `src/config.ts`: Where OAuth2 client config would go

## Completed
- Existing auth architecture documented [confidence: high]
- Identified async compatibility issue [confidence: high]

## Unresolved
- **OAuth2 provider not specified** — determines token endpoint, introspection API, scopes
  - Suggested resolution: ask human which provider (Auth0, Okta, custom)
- **Session persistence strategy unclear** — OAuth2 tokens are typically opaque; do we store them server-side or client-side?
  - Suggested resolution: investigate session store (Redis?) vs stateless design
- **Multiple valid approaches for token validation**:
  1. Introspection endpoint (real-time validation, extra latency)
  2. JWT-based OAuth2 tokens (offline validation, assumes provider issues JWTs)
  3. Hybrid (introspection on first request, cache for TTL)
  - Suggested resolution: requires architectural decision based on latency vs security trade-offs
- **Frontend migration path unknown** — 8 frontend components import `useAuth()` hook expecting JWT
  - Suggested resolution: investigate whether frontend can adopt OAuth2 flow or needs adapter layer
- **Backward compatibility requirement unclear** — can we drop JWT entirely or need dual support during migration?
  - Suggested resolution: ask human about migration timeline and rollback plan
```

#### Research Phase (Agent Teams)

**This goal is not a trivial bugfix or docs change, so Agent Teams is used by default.**

**Orchestrator identifies 3 research angles and spawns teammates** (assume subagent mode, not native Agent Teams):

| Subagent | Angle | Input |
|----------|-------|-------|
| **Feasibility** | Can OAuth2 be integrated without rewriting the entire auth layer? | Compressed research (facts only) |
| **Alternatives** | What are the trade-offs between the 3 token validation approaches? | Same |
| **Integration** | How does this affect the frontend and existing routes? | Same |

**Subagent outputs** (abbreviated):

**Feasibility Subagent**:
```markdown
## Completed
- OAuth2 can be integrated incrementally [confidence: high]
  - Existing middleware.ts has a plugin-style design (L45-60) — new auth strategies can be added without rewriting
  - JWT issuance can coexist with OAuth2 during migration (check `Authorization` header format to route to correct validator)

## Unresolved
- Provider-specific: If the provider doesn't issue JWT-format tokens, introspection is mandatory (adds 50–200ms latency per request)
```

**Alternatives Subagent**:
```markdown
## Completed
- **Introspection**: Works with any OAuth2 provider, adds ~100ms latency, requires caching to avoid rate limits [confidence: high]
- **JWT-based OAuth2**: Zero latency if provider issues JWTs (Auth0/Okta do), validates offline like current auth [confidence: medium — assumes provider issues JWTs]
- **Hybrid**: First request introspects, caches for token TTL. Complexity vs latency trade-off [confidence: medium — caching logic is nontrivial]

## Unresolved
- Latency impact on high-traffic routes (e.g., /api/health called 1k/min) — introspection may require bypass for public endpoints
```

**Integration Subagent**:
```markdown
## Completed
- Frontend migration is **not required** if we maintain the same `req.user` interface [confidence: high]
  - OAuth2 middleware can populate `req.user` identically to JWT middleware
  - Frontend `useAuth()` hook works with any backend auth as long as cookie/token semantics are preserved

## Unresolved
- OAuth2 PKCE flow requires frontend changes (code exchange) — but that's separate from middleware rewrite; migration can be phased
- 3 routes (`/admin/*`) have role-based checks that assume JWT claims structure — OAuth2 token may have different claim names (need mapping)
```

**Orchestrator synthesizes**:

```markdown
## Synthesis: OAuth2 Middleware Rewrite

### Findings

1. **Incremental migration is viable** — existing middleware architecture supports plugin-style auth strategies; JWT and OAuth2 can coexist during transition [Feasibility + Integration agreement]

2. **Provider choice dictates token validation approach**:
   - If provider issues JWT-format tokens (Auth0, Okta, Keycloak) → offline validation is possible, zero latency added
   - If provider issues opaque tokens → introspection required, ~100ms latency per request [Alternatives + Feasibility]

3. **Frontend does NOT need immediate changes** — as long as `req.user` interface stays stable; OAuth2 PKCE flow is a separate frontend task [Integration]

4. **High-traffic routes need special handling** — `/api/health` and similar should bypass token validation or use cached validation [Alternatives → Integration conflict: latency on public endpoints is unacceptable]

### Trade-Off Matrix

| Approach | Latency | Provider Compatibility | Complexity |
|----------|---------|----------------------|-----------|
| **Offline JWT validation** | +0ms | Requires JWT-issuing provider | Low (mirrors existing) |
| **Introspection** | +50–200ms | Universal | Medium (caching + rate limits) |
| **Hybrid** | +0ms (cached), +100ms (cold) | Universal | High (cache invalidation, TTL sync) |

### Strategic Recommendations

1. **Ask human to specify OAuth2 provider** — this determines whether offline JWT validation is available (preferred) or introspection is required.

2. **If JWT-based tokens available**: Recommend offline validation with incremental rollout (dual auth support → migrate frontend → deprecate old JWT).

3. **If introspection required**: Recommend hybrid approach with Redis caching (complexity justified by latency needs on high-traffic routes).

4. **Backward compatibility**: Support both auth schemes during migration — low risk, already compatible with current middleware design.

### Contradictions to Resolve

- **Alternatives subagent** highlighted latency risk on high-traffic routes
- **Integration subagent** noted `/admin/*` role checks assume JWT claim structure
- **Feasibility subagent** said incremental is possible, but didn't address how to handle claim mapping

**Recommended next step**: Human co-decision on provider + validation approach, then Plan phase defines claim mapping contract as part of middleware rewrite.
```

#### Human Co-Decision

**Orchestrator to human**:

> Agent Teams synthesis complete. Three angles analyzed (Feasibility, Alternatives, Integration). Key decision needed:
>
> **Which OAuth2 provider?**
> - If Auth0/Okta/Keycloak → they issue JWT-format tokens, we can validate offline (zero latency added)
> - If custom provider or opaque tokens → introspection required (~100ms per request), needs caching
>
> **My recommendation**: If you're not locked into a provider yet, choose one that issues JWTs (Auth0 or Okta). The latency difference matters at your scale (1k req/min on /api/health). Offline validation also simplifies caching and reduces external dependency risk.
>
> What's the provider, or should I research provider comparison first?

**Human**: Use Auth0, JWT-based tokens.

**Orchestrator**: Noted. Proceeding to Plan with this direction.

---

#### Phase 2: Plan (with Direction Input)

**Orchestrator assembles input**:
```markdown
## Goal
Rewrite auth middleware for OAuth2 (Auth0, JWT-based tokens)

## Codebase Research
[Compressed research output — facts only]

## Direction (from Agent Teams)
- Provider: Auth0, issues JWT-format tokens
- Validation approach: offline (same latency as current JWT auth)
- Backward compatibility: dual auth support during migration
- Frontend: no immediate changes required (maintain req.user interface)
- Claim mapping: Auth0 claims differ from current JWT structure, needs mapping layer
```

Plan agent produces contracts for:
1. OAuth2JwtValidator (offline validation, Auth0 public keys)
2. ClaimMapper (Auth0 claims → req.user interface)
3. DualAuthMiddleware (routes to JWT or OAuth2 validator based on token format)
4. Migration plan (phased rollout)

Human gate reviews High decisions (dual auth strategy, claim mapping interface) → approves → implement.

---

## Design Constraints and Known Limitations

### What This Design Does NOT Handle

- **Parallel sub-flows**: The flow is sequential. A goal requiring changes to 3 independent subsystems will go through one research → plan → implement → review chain, not three parallel ones. This is a known efficiency limitation. Future versions may allow plan to decompose into independent sub-flows that the orchestrator dispatches in parallel.
- **Long-running tasks**: The flow assumes agents complete in reasonable time. There is no checkpoint/resume mechanism if a session is interrupted.
- **Cross-goal coordination**: Each `/cf` invocation is independent. Two concurrent flows cannot coordinate or share contracts.

### Cost Awareness

Every loop-back costs tokens and human time. The design mitigates this through:
- Loop limits (2 re-runs per phase, 2 cross-phase loops total)
- Agents providing suggested resolution paths (reducing investigation time on re-run)
- Orchestrator compression (enriched goals, not raw dumps)
- Escalation with options (human can make quick decisions, not re-investigate)

But the design does NOT optimize for minimum token usage. If a goal requires 3 research loops to get the facts right, that's acceptable — shipping broken code is not.

---

## Summary

1. **Everything is contracts** — research informs them, plan defines them, implement fulfills them, review verifies them
2. **Orchestrator is the human's collaborative partner** — it provides opinionated analysis and recommendations, not bureaucratic checklists
3. **Contracts are behavioral, not structural** — they define input/output/errors, not file paths; implementation plan is separate guidance
4. **Every agent declares Completed (with confidence) and Unresolved (with resolution suggestions)** — agents provide decision support, not just status reports; there is no "low confidence" — that belongs in Unresolved
5. **Decisions are tiered with structural minimums** — plan classifies as High/Medium/Low; orchestrator enforces structural rules that prevent under-classification; human gate blocks on High/Medium with orchestrator's recommendation
6. **Plan is iterative** — humans approve, revise, or request more research until all High/Medium decisions are settled
7. **Implement is strict but transparent** — it faithfully executes contracts; reports technical infeasibility as Unresolved and implementation risks as Concerns
8. **Review has two scopes** — contract compliance (binding verdict) and advisories (non-binding observations on quality, security, performance)
9. **Any phase can loop back** — enriched goal mechanism; research agent just sees a more specific goal
10. **Loop-backs are budgeted** — 2 re-runs per phase, 2 cross-phase loops; limits trigger escalation, not hard stops
11. **Graceful degradation** — structured escalation with re-entry points; agents always provide analysis and options when stuck
12. **Agents are pluggable** — the flow defines contracts, not agents; the orchestrator matches agent capabilities to phase requirements
13. **Agent Teams default for research and review** — multi-perspective exploration (research) and multi-angle code review (review) by default; native Agent Teams when env var set, subagent parallel as fallback; skip to single agent only for trivially simple goals
14. **Simple-task skip, not complex-task trigger** — the previous ACS heuristic gating is replaced by skip conditions (single-file bugfix, typo, docs-only, user fast-path request); default is to use Agent Teams, not to avoid them
15. **Parallel implement for independent contracts** — orchestrator builds dependency graph, identifies independent groups, spawns up to 3 parallel implement agents with separate worktrees, merges and runs integration tests before review
