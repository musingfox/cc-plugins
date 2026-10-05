# Spiral — Ascent

Read this when the human picks 退回上一層, at §3's last exit or at §5's gate in
`commands/spiral.md`. It holds what runs only on that branch; when to offer the ascent stays in
the command.

## Reopen the layer

`L-1`, reopened, and back to step 1, diverging from the same source as `a1` at that layer. The
round counter there continues past whatever is already on disk; nothing is deleted.

Everything from the reopened layer downward **stops standing**: its plan is renamed (below) when
that layer is re-converged, and the plans below it — built on the claim that fell — contribute
nothing to promotion until they are re-earned. Say that plainly rather than quietly leaving them
in `.spiral/` for a later step to gather.

## Carry-over for the reopened layer

It has a different shape from an ordinary round's, and getting it wrong makes the reopening
pointless. Carry, verbatim: the claim that was falsified and what falsified it; the superseded
plan; and, of what was settled here, only what did not rest on that claim. A candidate that was
rejected *because of* the false claim is not a rejected candidate any more — it is live again,
and Divergence has to be told which is which, or it will honour the old rejection and hand back
the same menu the falsification was supposed to re-price.

## Re-converge

Rename the existing `.spiral/L<N>-plan.md` to `.spiral/L<N>-a<M>-plan.md` for the round that
produced it, write the new plan in its place, and open the new one by naming
the claim that was wrong and correcting it. Do that at §4, not at the ascent itself — a reopened
layer may well confirm what it already had. The superseded plan stays on disk: something that was
acted on for two layers is part of the record, not a draft.
