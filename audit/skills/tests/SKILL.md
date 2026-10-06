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
The skill never edits the repo and never runs the repo's tests, and the receipt in step 6
checks that on every run.

## 1. Resolve the repo

Take the repo from the argument and resolve a relative path to an absolute one. With no
argument, use `git rev-parse --show-toplevel` of the session's cwd. Make the scratch
directory outside the repo with `mktemp -d`.

Save `git -C <repo> status --porcelain` to `<scratch>/before.txt`.

Done when the repo is an absolute path, the scratch directory exists outside it and
`before.txt` exists.

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

Run `git -C <repo> status --porcelain` again and compare it with `before.txt`. When the two
match, print `repo untouched`. Otherwise print `repo changed during the audit:` followed by
the differing lines. The receipt reports and never aborts.

Print the list path, the `## Counts` and `## Hand to cf` blocks from the list, and the
receipt.

Done when the user has the list path, both blocks and the receipt.
