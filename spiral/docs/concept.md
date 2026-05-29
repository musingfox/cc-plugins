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
line was *drawn* by an opinion — mutation coverage is det, but "80% enough?" is non-det; a
test passing is det, but "which cases test the right thing?" is non-det. The residual
non-det never disappears; it is pushed onto the **threshold and criteria seams**, which
are anchored once by the decision-maker and never re-litigated below. That is what buys
the machine its purity.

---

## 3. The two roles

Two roles, named for the motion they own. (A role may be filled by a person, a team, or a
machine — the concept does not care which.)

- **The Convergence role** — vague idea → concrete result. It *formalizes* (turns the
  goal into a stable "what", with a feasibility verdict — including the legitimate verdict
  *infeasible*, which ends the pass with reasons and no result built) and it *builds*
  (turns the agreed "what" into the result, satisfying the deterministic gate). It does
  the narrowing.
- **The Divergence role** — concrete result → new ideas. It *judges against intent* (not
  just "does it pass" but "is this what was wanted, and where does it fall short"), *hunts
  adversarially* (breakage the spec never anticipated; a suite that passes while testing
  the wrong behavior), and *regenerates* the next non-det seed. It does the widening.

---

## 4. The machine and the decision-maker

Beyond the two motions, two further roles complete the system.

- **The machine** is the deterministic gate. It judges the det world by mechanism — right
  or wrong, no opinion. A failing gate means the pass is **not done**: it cannot be
  delivered or declared complete. This is the reality floor.
- **The decision-maker** is the anchor, and owns what no other role may take:
  1. the **criteria** — what the formalized "what" is, what "good enough" means;
  2. the **navigation** — when to keep oscillating, when to descend a layer (§5), when to
     stop, and the hardest call of all, when to break the frame (§7).

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
the non-det *input* of the layer below. How much the machine (§4) can judge also varies by
scope: at the planning layer little is mechanizable — there is no compiler for a strategy —
while at the implementation layer much is. The axiom holds at every layer; only the
formalizable fraction changes. So the picture is a spiral of spirals: oscillate within a
layer until the conclusion is solid, then descend to concretize it.

---

## 6. Iteration is change, not ascent — and only feedback makes it real

The spiral does **not necessarily improve**. Each iteration changes the system; the change
may be better, worse, or sideways. "Growth" means the system *evolved*, not that it *got
better* — and that is acceptable and expected. The point is to make a change, take the
feedback, and iterate.

What separates a real iteration from churn is **feedback**.

- A change licensed by genuine feedback from a concrete result is a real pass.
- A change driven only by "I want to go from A to B," with no feedback, is **false
  progress** — motion disguised as iteration.

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

The Convergence role may build *and* check its own result, because the det parts are judged
mechanically, not by the builder's self-assessment — the student does not grade their own
exam, the machine does. Divergence is a **separate** role because judging "is this what was
wanted" and hunting holes are opinion-judgments, so the judge must be independent of the
builder. The Convergence role authored the idea→result translation and is structurally
blind to its own misreading of the goal; only an independent Divergence role, and the
decision-maker who owns the goal, sit outside that translation.

Convergence does; Divergence judges; the machine gates; the decision-maker anchors and
navigates the layers.
