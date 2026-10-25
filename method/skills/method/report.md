# The report

Every node ends by writing one report file, in this shape. A muster worker writes it at the report path its ticket names. A node running as an interactive session (a rex pane) writes the same file at the path its author named; the shape is fixed because the upward channel differs and the reader must not care which it was.

## Where a problem goes

A problem with your own contract goes to the layer that wrote it, your author, and nowhere else. Your author decides whether it climbs further. A problem you can settle inside your authority is not reported as a problem; it is a decision taken (`route.md` for how you settle one from below).

## Shape

First line: `DONE` or `BLOCKED`, alone.

A `BLOCKED` report then states, in this order:

- **Kind**: `missing information` or `decision`.
- **Layer**: `code`, `contract` or `milestone`, copied from the review verdict that raised it. Only when a review raised it.
- **Found**: what you already found. Every receipt: the `file:line` you read, the command and its output, the report of the session you sent. Your author answers from this without redoing your work.
- **Options**: the ways forward you see, each with what taking it commits to and how costly it is to undo, and the one you lean to with its reason.

A `DONE` report then states:

- **Result**: what your contract now delivers, as an outcome a caller observes, and the branch and head sha that carry it.
- **Split**: `no`, or the sub-contracts you wrote with each sub-node's run name and the head sha you merged. Your author reads this to know whether a review is due (`review.md`).
- **Gates**: as a leaf, the verdict line of each gate you ran (`review.md` "Leaf").

Both kinds end with:

- **Decisions taken**: every Medium decision, each with its reason. Low ones need no entry.

Done: the file exists at the path you were given, and its first line is `DONE` or `BLOCKED` with nothing else on it.
