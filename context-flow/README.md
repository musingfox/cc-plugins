# Context Flow

Contract-driven development pieces: an agent that drafts behavioral contracts, a reviewer that checks an implementation against them, and the gate scripts that check a builder's work. There is no orchestrating command; whatever drives a flow dispatches these directly.

## Contents

| Piece | Purpose |
|-------|---------|
| `agents/plan.md` (`cf:plan`) | Drafts behavioral contracts and test cases from the contract the main session pinned with the human, tiers each decision High/Medium/Low, and lists the load-bearing assumptions with a receipt or `unproven`. Runs on `sonnet` at `high`. |
| `agents/review.md` (`cf:review`) | Verifies a builder's diff against the contracts on the Spec axis, read-only. Each FAIL and Blocker carries a layer (code, contract or milestone), and each advisory a repro command. Runs on `opus` at `high`. |
| `scripts/cf-scope.sh` | Gate: the files the commits in `base..head` changed are a subset of the files the contracts declared. `cf-scope.sh --repo DIR --base REV --head REV --contracts FILE`. Prints `ALLOWLISTED <csv>` and/or `UNDECLARED <csv>`; exit 0 clean, 2 undeclared, 1 error. On a clean range it prints nothing and exits 0. |
| `scripts/cf-revert-gate.sh` | Gate: runs the test command once at `head` (the control run, which reports `test_exit=`, `test_counts=` and a bounded log tail), then once per contract with the implementation put back to `base`; each contract's tests must go red. `cf-revert-gate.sh --repo DIR --base REV --head REV --contracts FILE --out DIR -- TEST_CMD [ARGS...]`. Last line is the verdict: `CLEAN <n>` (0), `STAYS_GREEN <A>[,<B>...]` (2), `TESTS_RED <n>` (3), `TESTS_STALLED <s>` (124), `ERROR <reason>` (1). Full log in `<out>/revert-gate.log`; `CF_TEST_DEADLINE_S` (default 1800) bounds each run. |
| `scripts/cf-add-repros.sh` | Appends a review's repros as test cases of the contracts they name. `cf-add-repros.sh --contracts FILE REPROS_FILE`; prints `ADDED`/`DUPLICATE` lines, archives the old file beside it as `contracts-prev-<ts>.json`; exit 0, 2 usage, 3 malformed, 4 jq missing, 5 unknown contract. |

A test suite that lives in a subdirectory goes through `bash -c`:

```
cf-revert-gate.sh --repo . --base main --head HEAD --contracts contracts.json --out /tmp/gate \
  -- bash -c 'cd muster && bun test'
```

TEST_CMD runs from the repository root of the gate's worktree, so a suite that runs from a subdirectory needs the `bash -c 'cd DIR && ...'` form.

The gates share one input: a repo, a base and a head (any revs that resolve to commits in the repo) and the `contracts.json` `cf:plan` writes (`schema_version` 1). Bad input or a missing `jq` is a single `ERROR <reason>` line and exit 1. A gate never changes the repo's checkout, index, branches, tags or stash; the revert gate runs in a detached worktree of its own under a temporary directory and removes it on every exit, signals included.

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
- `perl` (the revert gate's run supervisor)
- `python3` (`cf-add-repros.sh`)
- `shasum`
