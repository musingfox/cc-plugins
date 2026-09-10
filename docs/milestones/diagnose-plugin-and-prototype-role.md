---
status: done        # accepted | done | superseded
delivered: 3b10904, fe775e6, a330148   # prototype role, then the diagnose plugin
depends: []         # milestone slugs that must land first
---

# A `diagnose` plugin that stops at the evidence, and prototyping as a role inside the decision loop

Two upstream tools were to be imported: one that systematically finds out *why* something broke,
one that writes throwaway code to answer *whether a design is right*. They share a method — build
something that gives a red/green signal before reasoning about it — and that shared method is not
where they belong. This milestone settles where each lives, where each stops, and what each hands
to whom.

## What is committed

**They are split by when in the life of the work they are reached.** Prototyping answers a question
that is still open, so it joins the decision loop (`spiral`). Diagnosis explains something already
shipped and broken, so it ships as its own plugin, named **`diagnose`** — one name across
directory, manifest, and marketplace entry.

**Diagnosis stops at a confirmed cause plus one failing test.** It does not apply the fix. It works
in **its own worktree**, never the user's tree, and the branch it leaves behind is the hand-off.
That branch is **read from, never checked out**: `cf`'s seed brief lifts the failing-test commit
into its own workspace. Nothing already published on `cf` changes.

**`diagnose` is reached two ways** — automatically from what the user says, and by an explicit
command. The automatic entry **asks before it descends**.

**Prototyping runs as one dispatched in-process role** inside the decision loop, made cheap by the
**model tier** it runs on — the same shape the loop already uses to walk candidate directions.
There is no offload carrier, no quota routing, and no failure path to author. A prototype's verdict
is committed as a file on the same throwaway branch as the code it judges.

`diagnose` declares a dependency on `cf` — install-only, wiring nothing. The declaration names the
*plugin*, which is not the same string as its directory.

## Why the boundary is where it is

**`cf` has no stage that finds out why something broke.** It researches, plans, takes an approval,
implements, and checks against contracts. Diagnosis fills a hole rather than overlapping a stage,
so the feared collision does not exist at the level of workflow.

**The collision that does exist is over the working tree.** `cf` implements inside a `git worktree`
on its own branch, so anything uncommitted is invisible to it — instrumenting the real tree and
leaving the failing test uncommitted, as the upstream tool does, cannot work here. Once the
artifact must be committed to survive, the only question was whose tree it is committed in, and
the answer that keeps the tree contention resolved is: not the user's.

**The failing test is not a by-product; it is the artifact that crosses the hand-off.** It is what
makes the fix checkable by someone who did not do the diagnosis.

**Nothing is checked out, so cleanup never blocks the hand-off.** A branch live in a linked worktree
cannot also be checked out in the main tree; treating the branch as a source rather than a
checkout keeps workspace teardown off the critical path.

**"Cheap" was a property of the model tier, not of offloading.** The loop already dispatches roles
on a small model with no dependency and no glue. An offload carrier would have bought a declared
dependency, sibling-resolver glue, workspace ownership, and a hand-written quota-failure path — for
a saving already available.

**The prototype role's write access is granted openly, and the fence is where it writes, not
which tools it holds.** The role lists `Write` and `Edit` explicitly rather than smuggling writes
through `Bash`, which the loop's other roles already hold. No tool grant can bound where `Bash`
writes, so the bound is the same prose constraint the loop already uses: only inside its own
worktree, never the user's tree. A guard that `Bash` walks around would only suggest a protection
that is not there.

## What is deliberately left open

- **Whether the prototype role stays a named part of the oscillation or folds back into the probe.**
  It differs from a probe only in reach (run instead of read). The criterion is empirical: after
  three full `spiral` runs, if no probe has ever reported "this can only be answered by building",
  the role is one name for one probe outcome and folds back; if one has, it stays. Zero runs have
  reached that cell so far.
- **When a `diagnose` workspace is cleaned up.** Off the critical path, so this is hygiene, not
  correctness.
- **What the confirmation on the automatic entry says**, and how the two entry surfaces divide the
  work.

## What would overturn this

- **A request that is genuinely both at once** — someone reaching for a throwaway build *because*
  something is broken and the cause will not yield to reasoning. If that is common rather than a
  corner, splitting by situation put one workflow in two places.
- **A small bug where producing the failing test and then routing the fix through the full
  research-plan-approve cycle costs more than the bug.** The answer would be a lighter route for
  the fix, not a diagnosis tool that writes to the tree.
- **`cf`'s checking stage treating a lifted commit as suspect.** The fallback is a plain patch file
  the seed brief names.
- **Prototyping proving expensive enough, often enough, that the model-tier saving is not the
  saving that matters.** The trigger is a measured cost per prototype, not an impression.
- **The confirmation being declined or ignored so often that the automatic entry is pointless** — at
  which point the two surfaces are one surface with extra steps.

## Carried out of this work, not part of it

The offload mechanism's watch loop aborts against a machine-wide registry, so one dispatch hitting
a quota wall stops and marks failed **any unrelated offload run on the same machine**. Separately,
its quota pattern matches rolling-window usage limits that reset in hours under the same label as
genuine exhaustion. Both are live defects in a published component, independent of anything
decided here and of each other. Neither is this milestone's work; both are worth fixing on their
own.
