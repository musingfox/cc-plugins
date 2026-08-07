# Spiral — Concept

Spiral is built on one axiom and one shape. Things get made by **converging** a vague idea
into a concrete result, then **diverging** from that result into new ideas — and doing this
over and over. This document is that concept, not its application.

---

## 1. The two motions

There is an axis of certainty, and there are two ways to move along it.

- **Convergence** — from a vague idea toward a concrete result. Possibility *narrows*:
  many things it could be collapse into one thing it is. Motion is **toward determinism**.
- **Divergence** — from a concrete result toward new ideas. Possibility *widens*: a result
  that now exists sparks holes, improvements, and intents that could not be seen before it
  existed. Motion is **away from determinism**.

A pass through both is the unit. The whole is these passes, repeated.

It is a **spiral and not a circle** — not because it rises, but because each pass *changes
the system*. You never re-enter the identical state; even when you return to the same
question, you meet it from a changed place.

---

## 2. The axiom (everything else is a corollary)

> **The non-deterministic world has only OPINIONS. The deterministic world has only
> RIGHT/WRONG.**

Every unit of work belongs to exactly one of these worlds, and the most consequential act
is **sorting it correctly**.

The cardinal mistake is mis-sorting:

- **non-det treated as det** — mechanizing a judgment question (grepping for "is this
  good"). Produces false rigor and silent drift.
- **det treated as non-det** — gathering opinions about something with a right answer
  ("does it compile"). Wastes effort and lets wrong-ness survive disguised as "a valid
  opinion."

Convergence is largely the work of *moving questions from the non-det world into the det
world* (formalization). Divergence is the work of *generating the next non-det questions*
from a det result. The axiom tells each motion what it may mechanize and what it must
leave to judgment.

Determinism **concentrates** non-determinism; it does not eliminate it. Every right/wrong
line was *drawn* by an opinion — a cost figure is det, but "is that cheap?" is non-det; what
an API does is det, but "does that settle the choice?" is non-det. The residual non-det never
disappears; it is pushed onto the **threshold and criteria seams**, which are anchored once by
the decision-maker and never re-litigated below.

The sort also governs **how much capability each unit deserves**. Det work needs a mechanism,
not a mind — spend no judgment on it (a script, not a deliberator). Non-det work needs judgment
in proportion to its opinion-density *and* the cost of being wrong — and never less, for the
**checker**, than the thing it checks. Whether that capability is a senior versus a junior, or a
large model versus a small one, the allocation follows the sort, not the volume of work: a big
pile of mechanical labor still deserves no judgment, and a one-line call that turns the whole
result deserves the most.

---

## 3. The two roles

Two roles, named for the motion they own. (A role may be filled by a person, a team, or a
machine — the concept does not care which.)

- **The Convergence role** — vague idea → concrete result. It *formalizes*: turns what was
  chosen into a stable, determinate "what" — the commitment, what it forecloses, and what
  would overturn it. Open sub-choices it resolves rather than punts: a retrievable fact gets
  looked up, a reversible one gets a sane default. It does the narrowing.
- **The Divergence role** — concrete result → new ideas. It names the genuinely *distinct*
  directions the current state makes thinkable, *hunts adversarially* for the ones nobody
  framed, and sorts each by what taking it commits to. It does the widening — and it
  describes, never decides.

---

## 4. The decision-maker

Beyond the two motions, one role completes the system.

**The decision-maker** is the anchor, and owns what no other role may take:

1. the **choice** — which direction, and when what is on the table is good enough to settle;
2. the **navigation** — when to widen again, when to descend a layer (§5), when to stop, and
   the hardest call of all, when to break the frame (§7).

What is *not* theirs is as load-bearing as what is. A **retrievable fact** is nobody's vote —
it gets looked up. A **reversible** sub-choice gets a sane default and rides. Putting either in
front of the decision-maker looks like deference and works like noise: it spends the attention
that the one-way doors need, and it trains them to rubber-stamp (§2). Escalate by *cost to
reverse*, not exhaustively.

---

## 5. Spirals nest: layers and oscillation

A single pass rarely settles anything. More often you **oscillate** convergence ↔
divergence several times at one layer before the conclusion is solid enough to act on. (A
boss and a manager meet repeatedly — converge a draft, diverge on its flaws, converge
again — before any plan is handed to an engineer.)

**Layers are scopes of concreteness, and they nest.** A layer's converged conclusion
becomes the *vague seed* of the next, more concrete layer below it. The settled plan seeds
the implementation spiral; the implementation result seeds the next concern. Each layer
runs the same two motions at its own scope.

This makes **determinism relative to scope.** A plan is "determined enough" at the planning
layer yet is a "vague idea" at the implementation layer — the det *output* of one layer is
the non-det *input* of the layer below. How much can be settled by mechanism also varies by
scope: at the planning layer almost nothing is — there is no compiler for a strategy — while
at the implementation layer much is. The axiom holds at every layer; only the formalizable
fraction changes. **This is where the spiral stops.** Its subject is the layers with no
compiler — it descends through as many of them as the decision-maker asks for, and hands over
at the first one a machine could judge: once a result is determinate enough to be mechanically
right or wrong, the work belongs to a tool that has that machine. So the picture is a spiral of spirals: oscillate within a
layer until the conclusion is solid, then descend to concretize it.

---

## 6. Iteration is change, not ascent — and only feedback makes it real

The spiral does **not necessarily improve**. Each iteration changes the system; the change
may be better, worse, or sideways. "Growth" means the system *evolved*, not that it *got
better* — and that is acceptable and expected. The point is to make a change, take the
feedback, and iterate.

What separates a real iteration from churn is **feedback**.

- A change licensed by genuine feedback is a real pass. At the planning layer the feedback is
  the decision-maker's reaction to what was put in front of them, plus the facts the widening
  turned up — not a test result, and no weaker for it.
- A change driven only by "I want to go from A to B," with no feedback, is **false
  progress** — motion disguised as iteration. Re-listing last round's directions with new
  wording is exactly this: the most common way a widening loop fakes a pass.

The distinction is *feedback-grounded vs want-driven*, not *better vs worse*: a
feedback-grounded change that turns out worse is still a real iteration (you keep that
feedback for the next pass); a want-driven change with no feedback is fake even when it
looks like motion. Therefore the membrane from divergence into the next convergence is
**feedback-gated**: no real feedback, no legitimate next pass. This is the only discipline
that makes a non-monotonic spiral meaningful instead of thrashing.

---

## 7. Dead ends and breaking the frame

Iterating inside a fixed frame can stall — a dead end where more convergence and divergence
at the current scope yield nothing new.

Escaping is not automatic, and it is not the two roles' call to make. It requires a
conscious move by the decision-maker: jump to a **larger divergence scope** — re-question the frame itself,
not just its contents. The big problem in front of you may be a small problem in a larger
one; zoom out to the outer layer where the current whole is merely a part.

This frame-break is the deliberate, out-of-the-box counterpart — going *up* the layers — to
the normal descent of §5. The decision-maker owns both directions: descending to
concretize when a layer is solid, and ascending to reframe when a layer is stuck.

---

## 8. Why the split is sound

> Independence is needed **only where the verdict is an OPINION** (non-det). Where the
> verdict is **MECHANICAL** (right/wrong), bias is structurally immune, so no independence
> is required.

At these layers *every* verdict is an opinion — there is no compiler for a strategy (§5) — so
the split is not a convenience, it is the only thing standing in for the machine that does not
exist here.

Convergence and Divergence are **separate roles** because the one that narrowed a question is
structurally blind to what it narrowed away. Having committed to a reading of the goal, it can
no longer see the readings it dropped; asked to widen, it will widen *within* its own frame and
call that exploring. Only a role that never saw the narrowing — and the decision-maker, who
owns the goal — sit outside that translation.

The same blindness runs the other way, which is why the widening role does not decide. Naming
directions and choosing between them are different acts: whoever authored the options has
already weighted them, and a chooser who is also the author is picking their own favorite while
calling it a verdict. So Divergence describes and never decides; the decision-maker chooses
and never has to defend the menu they were handed.

Convergence narrows; Divergence widens; the decision-maker chooses and navigates the layers.
