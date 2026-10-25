# Method

[Experimental] One skill that teaches a session to act as one **node** of a contract tree: take a contract from the layer above, deliver it itself or split it into sub-contracts it writes, dispatch them, route what comes back, and report up in a fixed shape. A question that is not yet a contract is narrowed into one first. A node with only this plugin installed reaches everything below; `SKILL.md` is the entry and links the rest.

## Contents

| Piece | Purpose |
|-------|---------|
| `skills/method/` | The method itself: narrowing, do-or-split, writing `contracts.json`, dispatching, reporting, routing, and the one review per split. Read `SKILL.md` first. |
| `agents/review.md` (`method:review`) | Verifies a builder's diff against the contracts on the Spec axis, read-only. Each FAIL and Blocker carries a layer (code, contract or milestone), and each advisory a repro command. An optional `## Sub-contracts file` input shows it the decomposition; only the contract under review is verified. Runs on `opus` at `high`. |
| `agents/divergence.md` (`method:divergence`) | Narrowing's widening seat: names the distinct directions a layer could go and what each commits to. Never sees the node's hypotheses. |
| `agents/probe.md` (`method:probe`) | Walks ONE candidate direction shallowly, only to find what it collides with. |
| `agents/prototype.md` (`method:prototype`) | Builds and runs ONE throwaway thing to answer a question reading could not, on a branch nobody merges. |
| `scripts/check-contracts.sh` | Checks a `contracts.json` against the schema in `skills/method/contracts.md`. `check-contracts.sh FILE`; silent and exit 0 when clean, one line per violation and exit 1, exit 2 on unusable input. |
| `scripts/scope-gate.sh` | Gate: the files the commits in `base..head` changed are a subset of the files the contracts declared. `scope-gate.sh --repo DIR --base REV --head REV --contracts FILE`. Prints `ALLOWLISTED <csv>` and/or `UNDECLARED <csv>`; exit 0 clean, 2 undeclared, 1 error. On a clean range it prints nothing and exits 0. |
| `scripts/revert-gate.sh` | Gate: runs the test command once at `head` (the control run, which reports `test_exit=`, `test_counts=` and a bounded log tail), then once per contract with the implementation put back to `base`; each contract's tests must go red. `revert-gate.sh --repo DIR --base REV --head REV --contracts FILE --out DIR -- TEST_CMD [ARGS...]`. Last line is the verdict: `CLEAN <n>` (0), `STAYS_GREEN <A>[,<B>...]` (2), `TESTS_RED <n>` (3), `TESTS_STALLED <s>` (124), `ERROR <reason>` (1). Full log in `<out>/revert-gate.log`; `CF_TEST_DEADLINE_S` (default 1800) bounds each run. |
| `scripts/add-repros.sh` | Appends a review's repros as test cases of the contracts they name. `add-repros.sh --contracts FILE REPROS_FILE`; prints `ADDED`/`DUPLICATE` lines, archives the old file beside it as `contracts-prev-<ts>.json`; exit 0, 2 usage, 3 malformed, 4 jq missing, 5 unknown contract. |
| `scripts/render-decision.sh`, `scripts/wait-decision.sh` | The decision page: render a round brief to the browser through the `viz` plugin, then block until the human's Save. `render-decision.sh BRIEF [NAME]` ends with `[method] save-mode=browser\|inline`; `wait-decision.sh BRIEF [TIMEOUT_SEC]` prints the answers and exits 0, or exits 2 on timeout. |

A test suite that lives in a subdirectory goes through `bash -c`:

```
revert-gate.sh --repo . --base main --head HEAD --contracts contracts.json --out /tmp/gate \
  -- bash -c 'cd muster && bun test'
```

TEST_CMD runs from the repository root of the gate's worktree, so a suite that runs from a subdirectory needs the `bash -c 'cd DIR && ...'` form.

The gates share one input: a repo, a base and a head (any revs that resolve to commits in the repo) and a `contracts.json` (`schema_version` 1). Bad input or a missing `jq` is a single `ERROR <reason>` line and exit 1. A gate never changes the repo's checkout, index, branches, tags or stash; the revert gate runs in a detached worktree of its own under a temporary directory and removes it on every exit, signals included.

Run the plugin's own tests with `bash method/tests/run.sh`.

## Installation

```
/plugin install method
```

## Requirements

- `bash`
- `git`
- `jq`
- `perl` (the revert gate's run supervisor)
- `python3` (`add-repros.sh`)
- `shasum`
