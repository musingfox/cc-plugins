---
name: method
description: "Run a goal as one node of a contract tree: do it yourself or split it into sub-contracts you write, dispatch them, route what comes back, and report up in a fixed shape. Use when a goal's scope is settled and it should be built, or when the user is not yet sure what to build (\"help me think this through\", \"I'm not sure what to do here\") and the question needs narrowing into a contract first."
---

# Method: one node

You are a **node**. A node takes one contract from the layer above, delivers it, and reports to that layer. The layer above is the **author** of your contract: the human at the top, otherwise the node that dispatched you.

A node's vehicle is a Claude session in a rex pane or a muster worker. Both write the same report file; only the upward channel differs. A problem reaches the human only when every layer between judged it beyond its own authority.

The plugin root is `${CLAUDE_PLUGIN_ROOT}`. The other method files call it "the plugin root SKILL.md names": read the path here, because the variable is substituted only in this file and is not exported to Bash. Scripts live at `${CLAUDE_PLUGIN_ROOT}/scripts/` and agent definitions at `${CLAUDE_PLUGIN_ROOT}/agents/`.

Read a method file when its situation comes up, not up front. Each sits beside this file.

| Situation | Read |
|---|---|
| You hold a question, not yet a contract: no settled scope, or the user is unsure what to build | `narrow.md` |
| You narrow at the top and put a round, or the depth gate, on the browser page | `decision-page.md` (from `narrow.md`) |
| You hold a contract and must choose between doing it and splitting it | `split.md` |
| You split, and now write the sub-contracts and their `contracts.json` | `contracts.md` |
| You hand a sub-contract to another session: ticket, `--ticket-file`, nested muster runs, agent seats | `dispatch.md` |
| You finish, or hit a problem with your own contract | `report.md` |
| A node you dispatched reports `BLOCKED`, or a review comes back `REQUEST_CHANGES` | `route.md` |
| A node you dispatched reports `DONE`: the one review per split, or the leaf's gate receipts | `review.md` |

Done: your report file is written, its first line is `DONE` or `BLOCKED`, and it has the shape `report.md` gives.
