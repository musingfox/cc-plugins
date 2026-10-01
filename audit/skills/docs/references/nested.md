# Nested module

Homes: a directory's own `CLAUDE.md`, `.claude/rules/` files, and each package's
`README.md`.

## Rules for one directory

A rule that matters in one directory moves into that directory's `CLAUDE.md`, rules
only, starting with the directories that change most (`git log --name-only`). The parent
keeps a one-line pointer for a session that creates a file there before reading one;
[platform.md](platform.md#loading) says why. Follow the repo's `AGENTS.md` convention.

A rule spread over scattered paths becomes a `.claude/rules/` file with `paths:`.

## Packages in a monorepo

Each package's `README.md` says what that package is and how to install and use it. The
root `README.md` lists the packages and points at them. A package's description lives in
one place, or a test keeps the copies equal.
