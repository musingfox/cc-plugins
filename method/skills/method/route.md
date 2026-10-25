# Routing a report from below

A sub-node reported `BLOCKED`, or a review of a split came back `REQUEST_CHANGES`. You are the author it reports to. Settle it at your layer when you can; it climbs only past what your authority covers.

## A review Layer picks the route

A `REQUEST_CHANGES` verdict carries a `Layer:` line (`<plugin root>/agents/review.md` "Layers"):

- **`code`**: the implementation is wrong against a sound contract. Send it back to the builder: a `followup` while its run is idle, or a new run with `--base` at its branch. First add the review's repros to that builder's `contracts.json` (`review.md` "Repros"). It counts toward the bounce cap.
  A split node that receives a `code` finding over its integrated branch routes it down to the leaf whose sub-contract the FAIL concerns.
- **`contract`**: a contract is wrong or incomplete. Find who wrote the contract line the FAIL quotes. You wrote it: take the steps below. A sub-node wrote it, inside its own split: send the finding to that sub-node, which takes the same steps.
- **`milestone`**: the goal or a premise above the contracts is false. Nothing at your layer fixes it. Report up, `BLOCKED`, kind decision, with the review's Layer.

## The steps for a contract problem or a BLOCKED report

1. **Answer from your own context.** The answer is in what you read, decided or were told. Amend the sub-contract: edit its `contracts.json`, run `check-contracts.sh` again, and dispatch again with the amended file (`dispatch.md`).
2. **Gather the information, once.** Your context lacks the answer. Dispatch one session to fetch it (`dispatch.md` "An information session"). One round, no second. If its report still leaves you unable to judge, treat the question as a decision.
3. **Decide by tier** (`contracts.md` "Decision tiering"):
   - **High** (strategic or irreversible, or information only the human holds): report it up, `BLOCKED`, kind decision, with what you and the sub-node found and the options.
   - **Medium**: decide it, and log the reason under "decisions taken" in your own report.
   - **Low**: decide it.

   Then amend and dispatch again as in step 1.

## The bounce cap

Count the bounces per sub-contract: each time a `code` or `contract` finding sends the same sub-contract back. After **two** rounds, the next one does not go down again. Treat your own contract as the problem and report up, `BLOCKED`, with the two rounds' findings under Found. Two misses on one sub-contract say the decomposition, or the contract above it, is wrong; a third round would pay for the same miss again.

Done: the report is answered by a new dispatch carrying the amended contract, by a decision logged in your report, or by your own `BLOCKED` report to your author.
