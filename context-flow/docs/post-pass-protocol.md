# Post-PASS Protocol

Read from `commands/cf.md` when an APPROVE branch says to run the post-PASS rebase. Run the two sections in order: spec maintenance, then rebase + delivery.

## Post-PASS spec maintenance

Before rebasing, decide whether this flow established anything the **next** flow needs to know. Only three kinds qualify:

1. **Something deliberately not done** — a negative constraint. Code can never show this.
2. **An interface defined here that the next flow must reuse** — the slice of a contract that outlives this run. Not the whole contract: `contracts.json` already covers within-run dependencies.
3. **An existing spec that turned out to be stale** — highest value, because a worker hit it for real. Arrives as an escalation or a Concern, not as your own inference.

None of the three → write nothing. **Most flows produce zero entries; that is the healthy case.** A spec library that grows with every flow is a spec library nobody reads.

If something qualifies:

- **You write it.** You are the only participant present for the whole flow — research, gate, dispatch, review — so you are the only one who can tell a run-local detail from an invariant. Delegating the wording delegates the judgement.
- **Delegate collection, never authorship.** When you need facts you no longer hold — which files an invariant actually covers, whether a candidate `check:` command is green today and red against a real violation — dispatch a sub-agent to go find out and report back. What returns is evidence. You decide what it means and you type the entry.
- **Status is `proposed`.** Proposed entries are invisible to `slice`, so nothing you write here can reach a worker until a human promotes it to `accepted`. Commit it to the cf branch with the rest of the work — the human sees it in the same diff they are already reviewing.
- **Maintain the links.** Set `related:` to the entries this one bears on, and add the back-link on those entries. This is how you will know where to send an agent next time something needs checking; an entry with no links is one you will not find again.

Use the `spec` skill for the entry format and lifecycle. If the spec plugin is not installed, skip this step entirely.

## Post-PASS rebase + delivery

Run `cf-rebase.sh` to align the cf branch with the latest `$BASE_BRANCH`, then hand the branch to the human. Never auto-fast-forward `$BASE_BRANCH` — the human decides when to merge.

Pass `TEST_RUNNER` so the full suite runs on the tree the human is about to
fast-forward. Nothing else tests it: the shard gates and the integration gate
both ran before this rebase, and the advisory-fix route arrives here with
commits no gate has seen. The same diff over a moved base is a different tree,
so a green integration says nothing about what actually ships.

```bash
. "$SESSION/env.sh"
REBASE_STATUS=$("$SCRIPTS/cf-rebase.sh" "$SESSION" "$TEST_RUNNER")
echo "$REBASE_STATUS"
```

Interpret the first token of `$REBASE_STATUS`:

| Prefix | Meaning | What to tell the human |
|---|---|---|
| `OK <sha>` | Cf branch rebased onto latest `$BASE_BRANCH`, head is `<sha>`, suite green on that tree. | "Rebased onto `$BASE_BRANCH` and the suite passes there. Ready to fast-forward." |
| `NOOP <sha>` | `$BASE_BRANCH` hasn't moved during the flow; cf branch already linear over it, suite green. | "Already linear over `$BASE_BRANCH`, suite green." |
| `CONFLICT <files>` | Rebase aborted to keep state clean; cf branch is still at its original (pre-rebase) tip. | "Rebase conflicts in `<files>`. Branch left at original tip — resolve manually before ff." |
| `TESTFAIL <sha> <log>` | The delivered tree fails its own suite. | "The rebased tree fails the suite — do NOT fast-forward. Failures in `<log>`." Do not print the ff guidance. Ask the human how to proceed; shard re-runs cannot fix a failure the rebase onto a moved `$BASE_BRANCH` introduced. |
| `TESTSTALLED <sha> <log>` | That suite outran its deadline. | "The suite did not finish on the rebased tree (see `<log>`) — delivery is unverified, do NOT fast-forward." Ask the human whether to raise `CF_TEST_DEADLINE_S` and re-run, or ship unverified. |
| `OK-UNVERIFIED <sha>` / `NOOP-UNVERIFIED <sha>` | Same as `OK`/`NOOP`, but no `$TEST_RUNNER` was in scope, so nothing ran on the delivered tree. | "Rebased onto `$BASE_BRANCH`, but no test runner was resolved — the delivered tree is unverified." Still offer the ff, and say plainly that no suite backs it. |
| `SKIP <reason>` | Non-git mode or missing base; nothing to rebase. | Skip rebase messaging entirely. |

On `OK` / `NOOP` / `SKIP` (and the `-UNVERIFIED` pair), close with branch + ff
guidance. On `TESTFAIL` or `TESTSTALLED` the tree is not deliverable: say so and
stop, do not offer the fast-forward.

```
Phase 4 PASSED. Committed to branch `cf/$CF_SLUG` (<N> commits).

To merge into your branch:
  git checkout $BASE_BRANCH && git merge --ff-only cf/$CF_SLUG

Inspect first:
  git log --oneline $BASE_BRANCH..cf/$CF_SLUG
  git diff $BASE_BRANCH..cf/$CF_SLUG
```

On `CONFLICT`, also include the manual rebase command:
```
  git checkout cf/$CF_SLUG
  git rebase $BASE_BRANCH    # resolve conflicts, then git rebase --continue
```
