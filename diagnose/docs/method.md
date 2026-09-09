# Diagnosis method

A discipline for hard bugs. Skip phases only when explicitly justified.

When exploring the codebase, read `CONTEXT.md` (if it exists) to get a clear mental model of the relevant modules, and check ADRs in the area you're touching.

## Phase 0: Open a throwaway worktree

The diagnosis runs in a throwaway worktree. The user's working tree, index, and tracked files stay untouched.

Resolve the paths and open the worktree in **one** command:

```bash
REPO="$(git rev-parse --show-toplevel)"
WORK="${TMPDIR:-/tmp}/diagnose-$(basename "$REPO")-<slug>"
EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
grep -qxF '.diagnose/' "$EXCLUDE" 2>/dev/null || echo '.diagnose/' >> "$EXCLUDE"
git -C "$REPO" worktree add -b diagnose/<slug> "$WORK" HEAD
if ! git -C "$REPO" diff --quiet HEAD; then
  git -C "$REPO" diff --binary HEAD | git -C "$WORK" apply && echo "carried: uncommitted changes to tracked files"
fi
git -C "$REPO" ls-files --others --exclude-standard | sed 's/^/not carried (untracked): /'
echo "repo path: $REPO"
echo "worktree path: $WORK"
```

The worktree starts from HEAD **plus the user's uncommitted changes to tracked files**. The bug is usually in the code they are looking at, and `worktree add` alone checks out only the last commit — a loop built against that never goes red, and Phase 1's "refuse to give up" then sends you hunting a bug that is not in the tree. Untracked files are not carried; the command lists them. If the symptom lives in one, say so and ask before going on.

The worktree lives outside the repository. A second full checkout inside it would be invisible to git but not to anything that walks the filesystem — the user's test runner, linter, `rg`, or a file watcher running in the meantime would traverse it too. Only the patch file lands inside the repository, under `.diagnose/`, and that directory is what the exclude line is for.

`--path-format=absolute` is not optional: without it `--git-common-dir` answers relative to the current directory, so the same string names a different file the moment you move.

**Shell state does not survive between commands.** Every command you run starts a fresh shell, so a variable assigned in one command is empty in the next — and `cd "" && …` does not fail, it silently succeeds in the user's real checkout, which is exactly what the worktree exists to prevent. That is why the block above is a single command, and why it echoes the two paths. From here on, write those two paths out literally and in full in every command. Never carry `REPO`, `WORK`, or `BRANCH` forward as a variable.

Check the exclude line rather than assuming it — a second run in the same repo must not add a duplicate. Never write `.gitignore`.

The branch name has a slash; the path must not. If the branch or path already exists, append `-2`, `-3`, … until `worktree add` succeeds, and report the name actually used. Everything afterwards, teardown included, uses the name that succeeded — never the one you first tried.

Build inside the worktree. Prefix each command with `cd <the literal worktree path> &&` rather than cd-ing once — the last act deletes this directory.

### Teardown (every exit path)

Every exit path removes the worktree: the success path (once the commit and the patch file exist) and the early-stop path.

Write `<the literal repo path>/.diagnose/<slug>.patch` from the commit **before** removing the worktree. The path is inside the repository, not inside the worktree, so the patch survives.

Then, from the repository root:

```bash
git -C <the literal repo path> worktree remove --force <the literal worktree path>
```

`--force` is deliberate: untracked scratch otherwise blocks removal.

**Early-stop.** If the run ends without a commit, and `worktree add` had succeeded, tear down with the same fenced command above, then `git -C <the literal repo path> branch -D <the branch name that succeeded>` (remove the worktree first — git refuses `branch -D` while the branch is checked out in a worktree). Delete the branch so the closing output can claim no branch. If `worktree add` never succeeded there is no worktree to remove and no branch to delete: say that instead of running either command. Print what you tried and what is needed; do not invent a sha.

On the success path the branch survives and the closing output names it. No exit path leaves a worktree, or a branch the closing output does not account for.

## Redact

This method has you show commands, outputs and captured artifacts. **Redact every secret first**: write `<REDACTED>` in its place. Build loops against env vars, so the credential stays in the environment rather than in what you show. Captured artifacts carry auth headers: quote only the lines that carry the signal.

If the redacted output is not enough to diagnose the bug, say so and ask the user.

## Phase 1: Build a feedback loop

**This is the method.** Everything else is mechanical. If you have a **tight** pass/fail signal for the bug (one that goes red on _this_ bug), you will find the cause; bisection, hypothesis-testing, and instrumentation all just consume it. If you don't have one, no amount of staring at code will save you.

Spend disproportionate effort here. **Be aggressive. Be creative. Refuse to give up.**

### Ways to construct one, in roughly this order

1. **Failing test** at whatever seam reaches the bug: unit, integration, e2e.
2. **Curl / HTTP script** against a running dev server.
3. **CLI invocation** with a fixture input, diffing stdout against a known-good snapshot.
4. **Headless browser script** (Playwright / Puppeteer) that drives the UI and asserts on DOM/console/network.
5. **Replay a captured trace**. Save a real network request / payload / event log to disk; replay it through the code path in isolation.
6. **Throwaway harness**. Spin up a minimal subset of the system (one service, mocked deps) that exercises the bug code path with a single function call.
7. **Property / fuzz loop**. If the bug is "sometimes wrong output", run 1000 random inputs and look for the failure mode.
8. **Bisection harness**. If the bug appeared between two known states (commit, dataset, version), automate "boot at state X, check, repeat" so you can `git bisect run` it.
9. **Differential loop**. Run the same input through old-version vs new-version (or two configs) and diff outputs.
10. **HITL bash script**. Last resort. If a human must click, copy the HITL template the entry gave you into the worktree, fill in the steps, and tell the user to run it in their own terminal — you never execute it: it blocks on `read`, and your shell has no one at the keyboard, so it dies at the first step with nothing captured. The user pastes the `KEY=VALUE` tail back to you; that is the loop's output.

Build the right feedback loop, and the bug is 90% fixed.

### Tighten the loop

Treat the loop as a product. Once you have _a_ loop, **tighten** it:

- Can I make it faster? (Cache setup, skip unrelated init, narrow the test scope.)
- Can I make the signal sharper? (Assert on the specific symptom, not "didn't crash".)
- Can I make it more deterministic? (Pin time, seed RNG, isolate filesystem, freeze network.)

A 30-second flaky loop is barely better than no loop; a 2-second deterministic one is tight, a debugging superpower.

### Non-deterministic bugs

The goal is not a clean repro but a **higher reproduction rate**. Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A 50%-flake bug is debuggable; 1% is not, so keep raising the rate until it's debuggable.

### When you genuinely cannot build a loop

Stop and say so explicitly. List what you tried. Ask the user for: (a) access to whatever environment reproduces it, (b) a redacted captured artifact (HAR file, log dump, core dump, screen recording with timestamps), or (c) permission to add temporary production instrumentation. Do **not** proceed to hypothesise without a loop.

### Completion criterion: a tight loop that goes red

Phase 1 is done when the loop is **tight** and **red-capable**: you can name **one command** (a script path, a test invocation, a curl) that you have **already run at least once** (show the invocation and its output, redacted), and that is:

- [ ] **Red-capable**: it drives the actual bug code path and asserts the **user's exact symptom**, so it can go red on this bug and green once fixed. Not "runs without erroring"; it must be able to _catch this specific bug_.
- [ ] **Deterministic**: same verdict every run (flaky bugs: a pinned, high reproduction rate, per above).
- [ ] **Fast**: seconds, not minutes.
- [ ] **Agent-runnable**: you can run it unattended. The HITL script is the one exception, not a way to satisfy this box: the user runs it, and what counts as the loop is the pasted-back output.

If you catch yourself reading code to build a theory before this command exists, **stop: jumping straight to a hypothesis is the exact failure this method prevents.** No red-capable command, no Phase 2.

## Phase 2: Reproduce + minimise

Run the loop. Watch it go red as the bug appears.

Confirm:

- [ ] The loop produces the failure mode the **user** described, not a different failure that happens to be nearby. Wrong bug = wrong fix.
- [ ] The failure is reproducible across multiple runs (or, for non-deterministic bugs, reproducible at a high enough rate to debug against).
- [ ] You have captured the exact symptom (error message, wrong output, slow timing) so later phases can verify the fix actually addresses it.

### Minimise

Once it's red, shrink the repro to the **smallest scenario that still goes red**. Cut inputs, callers, config, data, and steps **one at a time**, re-running the loop after each cut, and keep only what's load-bearing for the failure.

Why bother: a minimal repro shrinks the hypothesis space in Phase 3 (fewer moving parts left to suspect) and becomes the clean regression test in Phase 5.

Done when **every remaining element is load-bearing**: removing any one of them makes the loop go green.

Do not proceed until you have reproduced **and** minimised.

## Phase 3: Hypothesise

Generate **3–5 ranked hypotheses** before testing any of them. Single-hypothesis generation anchors on the first plausible idea.

Each hypothesis must be **falsifiable**: state the prediction it makes.

> Format: "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."

If you cannot state the prediction, the hypothesis is a vibe: discard or sharpen it.

**Show the ranked list to the user before testing.** They often have domain knowledge that re-ranks instantly ("we just deployed a change to #3"), or know hypotheses they've already ruled out. Cheap checkpoint, big time saver. Don't block on it; proceed with your ranking if the user is AFK.

## Phase 4: Instrument

Each probe must map to a specific prediction from Phase 3. **Change one variable at a time.**

Tool preference:

1. **Debugger / REPL inspection** if the env supports it. One breakpoint beats ten logs.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup at the end becomes a single grep. Untagged logs survive; tagged logs die.

**Perf branch.** For performance regressions, logs are usually wrong. Instead: establish a baseline measurement (timing harness, `performance.now()`, profiler, query plan), then bisect. Measure first, fix second.

### Completion criterion: a cause is confirmed, not just favoured

Phases 5 and 6 speak of "the confirmed cause". A hypothesis is **confirmed** only when both hold:

- [ ] **Predicted**: a Phase 4 probe observed the effect the hypothesis predicted in Phase 3, at the boundary it named.
- [ ] **Flips the loop both ways**: neutralising the suspected cause alone — a stubbed call, a reverted commit, a swapped config value, nothing else changed — turns the loop green, and restoring it turns the loop red again.

The neutralising change is a probe, not a repair: make it in the worktree, run the loop, then discard it. It never reaches the commit, and it is not the fix — `/cf` decides what the correct change is. A hypothesis that survives on evidence that also fits another surviving hypothesis is not confirmed; go back to Phase 3 and find the probe that separates them. No confirmed cause, no Phase 5.

## Phase 5: Failing test at the seam

Turn the minimised repro into a failing test at the correct seam. Watch it fail. Commit it on the diagnose branch. Stop. The fix is `/cf`'s work; do not apply the fix.

A correct seam is one where the test exercises the **real bug pattern** as it occurs at the call site. If the only available seam is too shallow (single-caller test when the bug needs multiple callers, unit test that can't replicate the chain that triggered the bug), a regression test there gives false confidence.

If **no correct seam** exists, that itself is the finding. Commit the **minimised repro** under a clearly-marked debug location in the target repo, with the confirmed cause and the seam absence in the commit message. Label the closing line `Repro:` rather than `Test:`, and ask `/cf` to create the seam and promote the repro into a test.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail.
3. Commit the failing test on the diagnose branch.
4. Stop. Leave the rest to `/cf`.

## Phase 6: Cleanup

The worktree is about to be removed, so assert over the commit that crosses the hand-off, not the tree.

- [ ] Stage only the test (or repro) paths.
- [ ] `git show <sha>` carries no `[DEBUG-` tag.
- [ ] The commit adds that artifact and nothing else.
- [ ] The confirmed cause is stated in the commit message.
- [ ] Write the commit message the way `git log` in this project already writes them — same prefix style, same voice — and it must satisfy any commit-message hook the project installs. Never put this tool's vocabulary in the message (no phase numbers, no skill name). The message describes the confirmed cause in the project's own words.

## Hand-off

Print the hand-off only once the commit exists.

The patch file is already produced in Phase 0, before the worktree is removed, at `<the literal repo path>/.diagnose/<slug>.patch` (inside the repository, not the worktree). If removing the worktree fails, still print the hand-off and name the leftover directory — the branch is what matters. If the patch file could not be written, omit its line rather than print a path that does not exist.

On the success path, print exactly this:

```
Branch: diagnose/<slug>
Test: <sha>
Cause: <confirmed cause>
/cf Cherry-pick <sha> from diagnose/<slug> (read the branch; do not check it out) and fix the confirmed cause.
Patch: .diagnose/<slug>.patch
```

When the artifact is a repro rather than a test, label that line `Repro:` instead of `Test:`.

If Phase 0 carried uncommitted changes, add one line, `Carried: uncommitted changes to tracked files`. The test is red against HEAD plus those changes, not against HEAD alone, so `/cf` must have the same changes in place before it expects red.
