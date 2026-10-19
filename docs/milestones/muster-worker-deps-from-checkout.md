---
status: accepted
delivered:
depends: [muster-acp-workers]
---

# muster: workers start with the user's installed dependencies

## What this layer settles

A worker's clone today has no `node_modules`: muster runs no install, so a worker that needs dependencies installs them inside the sandbox from a cold run-dir cache, every run. muster now copies the dependency directories the user already installed in the source checkout into the worker's clone, with one APFS `clonefile(2)` call per directory, when the lockfile next to it matches the base commit. muster still runs no third-party code itself, and the worker's writes never reach the user's copy.

## What is now concrete enough to build on

- **What is copied.** For each lockfile (`bun.lock`, `bun.lockb`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) tracked at the base commit, muster copies `<dir>/node_modules` from the source checkout into `<clone>/<dir>/node_modules` when both hold: the source's working-tree lockfile hashes to the same blob as the base commit's (`git hash-object` against `git rev-parse <base>:<path>`), and the source's `node_modules` there is a real directory, not a symlink. Any other case copies nothing for that directory, exactly as today.
- **How it is copied.** One `clonefile(src, dst, 0)` from libSystem per `node_modules` directory, called through Bun FFI, after the clone is switched to its branch and before the worker session starts. Per-file `cp -c -R` lost: on a 1.5 GB `node_modules` it took 7.4 s against 0.63 s for one `clonefile(2)` on the directory (`git show spiral/prototype-muster-seed-clone:verdict.md`, commit 8dfdb50). When `clonefile` fails (another volume, a non-APFS volume, not macOS), muster copies nothing for that directory and records why; it never falls back to a slow copy.
- **The result is visible.** The run records each directory's outcome (copied, lockfile differs, no `node_modules`, clonefile error) in the run directory, and `status` prints a `deps=` field with how many directories were copied out of how many directories hold a tracked lockfile; two lockfiles in one directory count once, because the second `clonefile` into the same destination would fail. The coordinator can tell a worker without dependencies from one with them without reading the event log.
- **Isolation holds by copy-on-write, not by trust.** A write to a cloned file allocates new blocks, so the user's `node_modules` is unchanged. The prototype changed, deleted and added files in a copy's `node_modules` and left the source tree hash unchanged (verdict.md, Q2). The fence of `muster-acp-workers` is unchanged: Bash writes stay confined to the clone, and an Edit or Write whose realpath leaves the clone still asks.
- **Lockfile drift is not repaired.** When the lockfiles differ, muster copies nothing rather than installing in the copy, because an install over an older tree left removed packages and a stale `.bin` link behind (verdict.md, Q5).
- **Acceptance runs on the real adapter.** The e2e dispatches onto a repo with a lockfile and installed `node_modules`; the worker runs a command that imports a dependency, then writes into, deletes from, and truncates a hardlinked file under its copied `node_modules`; the source `node_modules` tree hash is the same before and after.

## What is deliberately left to the next layer

- **Gitignored build artifacts other than `node_modules`**, such as a native addon built at install time. oh-my-pi's tests needed one copied in by hand (verdict.md, surprises). Copying them needs a per-repo list, which waits until a real repo asks for it.
- **A seed for the git clone itself.** The `--no-hardlinks` clone still copies every object on each run. A seed checkout cloned with `clonefile(2)` cut a run to about 2.6 s on the large repo (sum of medians, not one end-to-end run). It is added only if clone time is shown to matter.
- **Package managers other than bun.** Only bun was measured. npm, yarn and pnpm lockfiles are matched by the rule above, but a pnpm store whose symlinks point outside the directory was not tested.

## What would overturn this

- `clonefile(2)` on a directory preserves hardlinks to the source's inodes, so a write in the copy changes the user's file. The prototype only tampered a hardlink inside a per-file copy, and seed2 had no hardlinks. The acceptance step above checks this; if it fails, the copy is not isolated and this layer is withdrawn.
- A copied `node_modules` contains absolute paths into the source checkout that the worker then follows. The prototype found none in bun's hoisted layout (verdict.md, Q1); a layout that has them reopens the design.
- Directions that lost: a muster-built seed with its own install lost because muster would then run lifecycle scripts itself, inside or outside the sandbox, and would own seed rebuilds and locking. Reusing a worker's clone across sessions lost because an injected worker could plant files for the next one. A shared writable cache or `$HOME`, as openab does, lost for the same reason. `git clone --shared` and git worktrees lost earlier: the first breaks after the source runs gc, the second shares a writable `.git`.

## Suggested skills

- `cf` implements this milestone: research, contracts, implement, review.
- `ctx7` (rule, not a skill) fetches the Bun FFI docs before `clonefile` is bound.
