---
name: tests
description: Audit whether a repo's tests guard what its delivered milestones committed to — trace each commitment clause in docs/milestones/ to the assertion that checks it, and list the clauses no test guards.
disable-model-invocation: true
argument-hint: "[repo path]"
---

# Audit tests against milestone commitments

A milestone's commitments are the one source of what the delivered work must do. This
audit traces each commitment clause to the tests meant to guard it and says which clauses
nothing guards. It works at the requirement level: it reads assertions and judges them.

## 1. Resolve the repo

Take the repo from the argument and resolve a relative path to an absolute one. With no
argument, use `git rev-parse --show-toplevel` of the session's cwd. Make the scratch
directory outside the repo with `mktemp -d`.

Done when the repo is an absolute path and the scratch directory exists outside it.

## 2. List the milestones

Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/milestones.sh" <repo>`. Each line is
`<action>\t<status>\t<path>`.

- When the script exits 2, relay its stderr and stop.
- When it exits 1, print its stderr and stop.
- With zero `trace` lines, print `No standing milestones in <repo>/docs/milestones/` plus
  the skip lines, and stop without writing a list.

Name the milestones you are about to trace.

Done when you have printed the `trace` milestones, or stopped with the message above.

## 3. Find the test files

Run `bash "${CLAUDE_PLUGIN_ROOT}/scripts/test-files.sh" <repo>` into `<scratch>/tests.txt`.
When it exits 1, print its stderr and stop.

Done when `<scratch>/tests.txt` exists.

## 4. Trace

Dispatch one `audit:tests-tracer` per `trace` line, in parallel, each with:

- `Milestone: <repo>/<path>`
- `Repo: <repo>`
- `Tests: <scratch>/tests.txt`
- `Report path: <scratch>/<slug>.md`, where the slug is the milestone filename without `.md`

Each tracer is one opus xhigh seat, so the cost scales with the number of milestones.

Done when every tracer has returned.

## 5. Assemble

Save the inventory from step 2 to `<scratch>/inventory.tsv`, then run
`bash "${CLAUDE_PLUGIN_ROOT}/scripts/assemble.sh" <scratch>/inventory.tsv <scratch>`
into `<scratch>/tests-audit.md`. A tracer that failed shows as `not traced`, and
a missing report is never read as a clean milestone.

Done when `<scratch>/tests-audit.md` exists.

## 6. Report

Print the list path, the `## Counts` and `## Hand to cf` blocks from the list.

Done when the user has the list path and both blocks.
