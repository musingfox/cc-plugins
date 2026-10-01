# Contributing module

Home: `CONTRIBUTING.md`. GitHub links it from the root, `docs/` or `.github/`, and when
several exist it picks `.github/` first, then the root, then `docs/`
([GitHub docs](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors)).

## What it holds

The development process as a human follows it: setup, branching, commits, review and
release.

A rule a hook or CI enforces gets one line that names the hook or job; the hook is the
source of truth. Setup steps name the file that pins a version instead of copying the
version.

## Against CLAUDE.md

`CLAUDE.md` keeps one clause for each rule an agent must follow before a hook would
catch it, plus a pointer to `CONTRIBUTING.md`. A longer passage repeated in both is a
duplicate: keep it in `CONTRIBUTING.md` and leave the clause behind.

## Keeping it from drifting

Check every command, script and target the doc names against the package scripts,
`Makefile` or task runner.

## Question when only the signal fires

"The repo has hooks but no contributing guide. Does anyone besides the hooks' author
follow a process the hooks do not state?"
