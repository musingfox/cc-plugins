# Architecture module

Home: `ARCHITECTURE.md` at the root. The shape follows
[matklad's ARCHITECTURE.md](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html).

## What it holds

- A bird's-eye view of the problem the project solves.
- A codemap: the coarse modules, what each does and how they relate. It answers "where
  is the thing that does X?" and "what does the thing I am looking at do?".
- Boundaries between layers and systems, and invariants stated as an absence, such as
  "the model layer does not depend on the views".
- Cross-cutting concerns, in their own section.

How each module works belongs in inline docs. An invariant that can break silently gets
a `/spec:spec` entry, and the map names it. Why the structure was chosen goes to
`/adr:adr`.

## Keeping it from drifting

The map names files, modules and types and never links them: a name survives a move
that breaks a link, and symbol search finds it. It stays short and limited to what
rarely changes, and it is revisited a few times a year rather than synced on every
change.

Check every named file, module and type with a search. A name that no longer exists is
current-state drift and is fixed in the same change.

## Question when only the signal fires

"This repo has no map of where things live. Should the audit draft a codemap from the
code for you to correct?"
