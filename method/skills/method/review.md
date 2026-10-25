# One review per split

A builder never verifies itself. Verification costs a context, and review was 77–85% of measured subagent spend, so it runs once per split, not once per leaf. A review per leaf would multiply that cost and still pass a wrong decomposition, because review checks contracts as written (`context-flow/agents/review.md:216`). The review of a split is the one place the decomposition itself is judged.

## Leaf

A node that did its contract itself gets no review. It runs the mechanical gates over its own commits, `<base>..HEAD`, against the `contracts.json` from its ticket written back out to a file, and quotes each verdict line in its report:

- `context-flow/scripts/cf-scope.sh`: every changed file is declared.
- `context-flow/scripts/cf-revert-gate.sh`: each contract's tests go red with its implementation put back.

Their usage, verdict lines and exit codes are in each script's header and in `context-flow/README.md`. A gate verdict is mechanical, so running it on your own work is no self-verification. A red gate is a code problem: fix it and run the gates again before reporting.

## Who reviews a split

The author of the splitting node's contract dispatches the review. When a node you dispatched reports `DONE` with a split, that is you. When you split, it is your author, over your branch; you report and wait.

At the top the author is the human. A main session that split dispatches its own review on the human's behalf: the reviewer runs in a context of its own, so the builder still does not verify itself.

## Dispatching it

Dispatch `cf:review` (`dispatch.md` "Agent seats") with the four inputs `context-flow/agents/review.md` "Dispatch Inputs" names:

- **`## Contracts file`**: a `contracts.json` holding only the contract you wrote for that node, the one under review.
- **`## Diff command`**: `git diff <base>..<head>` over its **integrated branch**, the head sha its report names, run in the repository its branch was fetched into.
- **`Report path:`** and **`Repros path:`**: absolute paths of files that do not exist yet.

Attach its sub-contracts as context: a `## Sub-contracts file` line naming the `contracts.json` files it wrote. They show the reviewer the decomposition; the contract under review is still the only one it verifies.

## Reading the verdict

- **`APPROVE`**: merge that head sha into your branch.
- **`APPROVE-with-advisories`**: merge, then turn each advisory into a test case or drop it; never apply a reviewer's suggested fix by hand (`context-flow/agents/review.md:78`).
- **`REQUEST_CHANGES`**: the next line is the `Layer:`. Route it with `route.md`.

## Repros

Before a `code` round goes back down, add the review's repros to the contracts the builder holds: `context-flow/scripts/cf-add-repros.sh --contracts <its contracts.json> <repros file>`. Each repro becomes an `R<n>` test case the next build and the next review both run.

Done: every split you authored that reported `DONE` has a review report on disk, and its verdict is merged, routed, or reported up.
