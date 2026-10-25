# Context Flow

Contract-driven development pieces: an agent that drafts behavioral contracts, a reviewer that checks an implementation against them, and the gate scripts that check a builder's work. There is no orchestrating command; whatever drives a flow dispatches these directly.

## Contents

| Piece | Purpose |
|-------|---------|
| `agents/plan.md` (`cf:plan`) | Drafts behavioral contracts and test cases from the contract the main session pinned with the human, tiers each decision High/Medium/Low, and lists the load-bearing assumptions with a receipt or `unproven`. Runs on `sonnet` at `high`. |
| `agents/review.md` (`cf:review`) | Verifies a builder's diff against the contracts on the Spec axis, read-only. Each FAIL and Blocker carries a layer (code, contract or milestone), and each advisory a repro command. Runs on `opus` at `high`. |
| `scripts/cf-pi-scope.sh` | Gate: the files a shard changed are a subset of the files its contracts declared. |
| `scripts/cf-pi-test.sh` | Gate: runs the test command with bounded output and emits `test_exit=` and `test_counts=` markers. |
| `scripts/cf-pi-revert-gate.sh` | Gate: each contract's tests fail with its implementation reverted. |
| `scripts/cf-pi-add-repros.sh` | Appends a review's repros as test cases of the contracts they name. |
| `scripts/cf-pi-env.sh` | Environment the four gates source. |

Run the plugin's own tests with `bash context-flow/tests/run.sh`.

## Philosophy

**Agent = Context + Goal + Tools.** Agents are defined by the information they receive, the output they must produce and the tools they can use, not by roles. Contracts, which are behavioral specifications with concrete test cases, connect them.

## Installation

```
/plugin install context-flow
```

## Requirements

- `bash`
- `git`
- `jq`
- `shasum`
