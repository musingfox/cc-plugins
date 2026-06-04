# Spiral — Team Evolution (design note)

> **Status: exploratory, post-MVP.** Not implemented. The MVP stays single-Convergence +
> single-Divergence, strict sequence, no fan-out (concept §, "MVP scope"). This note pins a
> coherent target topology for when handoff information-loss or single-judge variance demonstrably
> bites. It elaborates the existing roles into a team shape; it does **not** revise `concept.md`.

## 1. Why depart from the strict sequence

The MVP pipeline — FORMALIZE → EXAMINE → BUILD → machine gate → Divergence — passes only the
**artifact** across each boundary, never the **reasoning**. Two real costs follow:

- **Handoff information-loss.** BUILD that hits an implementation difficulty can only *report* it
  (a one-way handoff); it cannot *ask*. EXAMINE that is unsure whether a check matches the original
  intent must guess or flag a criteria gap. The thinking is dropped at each wall.
- **Single-judge variance.** One Divergence pass is one lens. A result can break in several
  independent ways (correctness, security, performance, reproducibility, goal-fit) that one judge
  may not cover.

The target topology addresses both **without** weakening the independence (§8) that makes the
verdicts trustworthy.

## 2. The model: two rooms + an orchestrating membrane

```
        MANAGEMENT ROOM  (the goal-owning side)
        ┌───────────────────────────────┐
        │  Divergence × N                │  generate directions (A/B…) — collaborative
        │  + the decision-maker (human)  │  own intent; judge fidelity — independent/blind
        └──────────────▲──┬─────────────┘
        escalation      │  │  intent / direction (the WHAT — never the HOW)
        (difficulty)    │  ▼
        ┌───────────────────────────────┐
        │  DEV ROOM  (the translation side)                       │
        │  FORMALIZE / BUILD  — collaborate, back-question freely  │  own the HOW
        │  EXAMINE  — build-blind (internal sub-wall)              │  escalate up on difficulty
        └───────────────────────────────┘
              ↑
        orch = the membrane between the rooms:
          • WHAT down, results/holes up        • runs the machine gate
          • value is what it REFUSES to pass   • surfaces decisions to the human
```

This is grounded in `concept.md` §8, which already groups *"an independent Divergence role, **and**
the decision-maker who owns the goal"* together as the parties who *"sit outside that translation."*
Divergence and the human are the **same side** — the goal-owners. Convergence is the **translator**.

- **Management room (goal-owning side)** = Divergence ×N + the human. It (a) **generates
  directions** — the next seeds, the A-vs-B options; (b) **owns intent**; (c) **judges fidelity** —
  whether the built result faithfully translated the chosen direction.
- **Dev room (translation side)** = Convergence (FORMALIZE / BUILD), with EXAMINE behind an internal
  build-blind wall. It **owns the HOW**, collaborates internally, and **escalates difficulties up**.
- **orch** = the membrane. Not a transparent relay — a **selective, time-gated filter**. Its value
  is in what it refuses to pass.

## 3. The firewall is around the TRANSLATION (how), not the intent (what)

The independence §8 protects is against **Convergence misreading the goal and grading its own
misreading**. It is *not* a ban on the goal-owner stating the goal. Therefore:

- **Management may clarify intent downward and receive escalations** — safe. When Divergence later
  judges, it judges Convergence's **translation**, which Convergence did alone. Authoring the
  *direction* is not co-authoring the *result*.
- **Management must not direct the solution (the HOW) or pre-bless the result before judging it** —
  that turns the judge into a co-builder and burns its independence.

So the line orch polices is **what vs how**: downward traffic carries intent only; a "clarification"
that smuggles in a solution choice is a firewall breach. And Convergence may never have a judge
bless its solution in advance.

> This revises an over-cautious earlier claim ("never let BUILD/EXAMINE ask Divergence"). The real
> rule: an **intent** question may go up to management (Divergence included, since it co-owns the
> goal); a **solution** question may never be put to the judge.

## 4. The two rooms have *asymmetric* internal rules

"Two rooms" is not two of the same thing. Their internal rules are opposite, and this is load-bearing:

| | Dev room (Convergence) | Management room (Divergence + human) |
|---|---|---|
| internal mode | **open collaboration** — members + the human back-question freely | **dual-mode by moment** (below) |
| motion | narrow → converge to **one** coherent result | widen → keep **many** independent voices |
| why safe | all on the judged side; collaboration breaks nothing | see dual-mode |

**Management room dual-mode** — same people, two moments, two rules:

- **Generating direction** (arguing A vs B) → **collaborative debate is healthy** (concept §5: boss
  and manager oscillate to a plan). Multiple Divergence voices may argue together here.
- **Judging fidelity** (auditing the result) → **must be independent**. A panel of judges must be
  **mutually blind** — each gets artifact + goal, never each other's findings — or diversity
  collapses into groupthink. orch fans out and aggregates; the judges do not confer.

EXAMINE carries its own internal sub-wall: it is Convergence-side (it may ask FORMALIZE / the human
about **spec and intent**) but stays **build-blind** — it never reads the BUILD code, or the gate it
forges can be bent to fit that code (§8).

## 5. The tooling rule falls out of the firewall

**Peer messaging (`SendMessage`) belongs only where collaboration is safe.**

- Dev-room members → **have** `SendMessage` (peer back-question + escalate to orch).
- Management-room **when generating direction** → may collaborate.
- Fidelity **judges** (the Divergence panel) → **fire-and-forget, no `SendMessage`, mutually blind**;
  they only return a value to orch.
- orch holds all aggregation.

A judge having no way to talk to peers is **correct by design**, not a missing feature. (The cleanup
failure observed while building this note — a Divergence agent placed in a Team but lacking
`SendMessage`, so it could never complete the shutdown handshake — was a tool/role mismatch, not a
platform limit: a judge should never be a chatty Team member in the first place.)

## 6. Claude Code mapping

| Architecture element | Claude Code primitive | Confidence |
|---|---|---|
| two rooms | `TeamCreate` + `Agent(team_name, name)` | verified (used) |
| orch = membrane | main thread, or a `Workflow` script | verified |
| dev-room peer back-question | teammate↔teammate `SendMessage` | documented + prior MVP-verified |
| dev → orch escalation | teammate `SendMessage` to lead | verified |
| judge panel ×N mutually blind | parallel fire-and-forget `Agent` / `Workflow` `parallel()` | verified |
| preserve reasoning within a turn | `SendMessage` continues an agent, context intact | verified |
| human as a switchboard port | `AskUserQuestion` / main-thread surfacing | verified |
| WHAT-down / build-blind / time-gate | dispatch **content control** (orch decides each payload) | verified (orchestration) |

**Not platform-enforced — must be orch discipline:** the firewall itself. The platform gives
channels, not the rule for *what* may cross. Divergence does not automatically lack Convergence's
notes — the orch must omit them from the dispatch. The what/how line and no-pre-blessing are
orchestration logic, not guarantees.

**Verification status** (claude-code-guide could not reach the platform docs in-session; resolved
empirically instead):
1. **Nested spawning — resolved empirically: NOT available.** A spawned `general-purpose` subagent
   (tools `*`) has **no Agent/Task tool** in its set, so it cannot spawn a further agent. **Topology
   is therefore STAR, confirmed:** the orch (main thread) spawns *every* dev-room member and *every*
   judge. Rooms are **logical groupings, not self-governing units.** This reinforces the model — the
   orch is structurally the only spawner, hence the only membrane. (Peer back-question still works:
   it is member↔member `SendMessage` within an already-spawned Team, which needs no spawning.)
2. **Persistent team-member lifecycle** — *resolved empirically this session.* A Team member that
   lacks `SendMessage` cannot complete the `shutdown_request`/`shutdown_response` handshake, so
   `TeamDelete` is blocked and the member lingers idle (observed first-hand). **Design consequence,
   already in §5:** only the dev room is a persistent Team and every member is tooled with
   `SendMessage`; the judge panel is fire-and-forget (no Team membership → no lifecycle to manage).

## 7. Implementation routes

- **(a) Main thread as orch** — most flexible; manual, token-heavy, non-deterministic. Good for a PoC.
- **(b) `Workflow` script as orch** — deterministic fan-out/aggregate, schema-validated returns;
  ideal for the judge panel. More constrained agents (no interactive MCP, schema-driven).
- **Likely hybrid:** `Workflow` runs the Divergence panel (blind fan-out → aggregate); a persistent
  Team (members all tooled with `SendMessage`) runs the dev-room collaboration; the main thread (or
  the workflow) is orch.

## 8. Relationship to `concept.md`

This is an **elaboration of the roles into a topology**, not a new theory:

- §3 roles (Convergence / Divergence) → the two rooms.
- §8 independence (Divergence + decision-maker sit outside the translation) → the firewall placement
  (management vs dev), and the what/how line.
- §5 oscillation (converge ↔ diverge until solid) → the escalation loop between the rooms, clocked
  by orch.
- §2 capability-by-sort → fan out judges by cost-to-reverse × judgment-density, not by default.

The MVP remains the floor. This topology is the **confidence/throughput ceiling** to climb toward
only when the evidence (handoff loss, judge variance) justifies its added complexity.

## 9. Minimal PoC skeleton

Topology is **star** (§6.1): the orch spawns everything. Two slices, by readiness.

### 9a. Judge panel — runnable today (`Workflow`)

The Divergence confidence-mode (multi-judge, mutually blind, orch aggregates) maps directly onto
`Workflow` `parallel()`. Each judge gets `artifact + goal + its own lens` and **never** another
judge's findings — blindness by construction. Illustrative script:

```js
export const meta = {
  name: 'spiral-judge-panel',
  description: 'Fan out N mutually-blind Divergence judges on one result, aggregate holes',
  phases: [{ title: 'Judge' }, { title: 'Aggregate' }],
}
const HOLE = { type: 'object', properties: {
  holes: { type: 'array', items: { type: 'object', properties: {
    claim: { type: 'string' }, where: { type: 'string' },
    shipBlocking: { type: 'boolean' }, lens: { type: 'string' },
  }, required: ['claim', 'shipBlocking'] } },
  verdict: { type: 'string' },
}, required: ['holes', 'verdict'] }

const LENSES = ['correctness', 'security', 'performance', 'reproduces', 'goal-fit']
const { artifactRef, goal } = args            // orch passes ONLY artifact + goal — never con's notes

phase('Judge')
const panels = await parallel(LENSES.map(lens => () =>          // blind fan-out
  agent(`You are an independent Divergence judge, lens = ${lens}.
Judge this result against the GOAL (not "did it pass"). Artifact: ${artifactRef}. Goal: ${goal}.
Hunt adversarially through your lens only. You have NOT seen other judges.`,
    { label: `judge:${lens}`, phase: 'Judge', schema: HOLE, model: 'sonnet' })))   // cost cap

phase('Aggregate')
const all = panels.filter(Boolean).flatMap(p => p.holes)        // orch aggregates — judges never confer
const dedup = Object.values(Object.fromEntries(
  all.map(h => [`${h.where}::${h.claim}`.toLowerCase(), h])))
return { shipBlocking: dedup.filter(h => h.shipBlocking), parkable: dedup.filter(h => !h.shipBlocking) }
```

Run via `Workflow({ name/script, args: { artifactRef, goal } })`. Note: this is a **fidelity-judge**
panel — the blind/independent mode. It is *not* the "generate directions A/B" mode, which is
collaborative and would be a separate, non-blind dispatch.

### 9b. Dev room — orchestration sketch (persistent Team)

Not a `Workflow` (those agents are effectively fire-and-forget); the collaborating dev room is a
persistent Team the **main-thread orch** drives. Star topology + the §5 tool rule:

```
orch: TeamCreate("dev-room")
orch: spawn FORMALIZE, BUILD  — Team members, each WITH SendMessage (they back-question)
orch: spawn EXAMINE           — Team member WITH SendMessage to FORMALIZE/orch,
                                but its dispatch withholds the build (build-blind sub-wall)
loop:
  BUILD hits difficulty → SendMessage(orch): "intent of X — A or B?"   // a WHAT question
  orch → routes UP to management (human, and/or Divergence as goal co-owner)   // never a HOW answer
  orch → SendMessage(BUILD) the clarified intent only
  BUILD claims infeasible → orch runs the §-step-4 path (EXAMINE the why → judge panel 9a)
orch: machine gate at commit (unchanged)
orch: on done → SendMessage(shutdown_request) to every member (all have SendMessage → clean exit),
      then TeamDelete   // the lifecycle §6.2 lesson: every member MUST hold SendMessage
```

**The two firewall invariants the orch must enforce in code (platform does not, §6):**
1. A judge's / management's dispatch may answer **WHAT** (intent), never **HOW** (solution).
2. A judge's dispatch carries **artifact + goal only** — never the dev room's reasoning/notes.

### 9c. Recommended first build

Ship **9a alone** behind the existing single-Divergence step as an opt-in "confidence mode" gated by
cost-to-reverse (§2). It is fully implementable today, needs no persistent Team, and directly buys
the multi-lens coverage the lone judge of the live debate already proved valuable. Defer 9b until
9a earns its keep and persistent-Team token behavior is measured.
