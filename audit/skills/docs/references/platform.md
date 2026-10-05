# How agent-facing docs reach Claude Code

Checked against the docs and Claude Code 2.1.286 on 2026-10-01. Recheck after a major
release; these mechanics have changed before.

## Loading

- `CLAUDE.md` files in the working directory and every directory above it load at
  launch. A subdirectory's `CLAUDE.md` loads on demand, when Claude reads a file in that
  subdirectory.
  [memory › How CLAUDE.md files load](https://code.claude.com/docs/en/memory#how-claude-md-files-load)
- Edit needs a prior Read, so editing an existing file loads its directory's
  `CLAUDE.md`. Whether creating a file with Write does the same is not documented
  (unverified), which is why a parent keeps a pointer to each nested file.
- By default a nested `AGENTS.md` is read only when no `CLAUDE.md` exists in the working
  directory or above it. In a repo with a root `CLAUDE.md`, name nested files
  `CLAUDE.md` and symlink `AGENTS.md` to them for other tools.
  [memory › AGENTS.md](https://code.claude.com/docs/en/memory#agents-md)
- A `.claude/rules/` file with `paths:` globs loads when Claude reads a matching file.
  It suits a rule spread over scattered paths; a per-directory `CLAUDE.md` suits a rule
  owned by one directory.
  [large codebases › per-directory CLAUDE.md or path-scoped rules](https://code.claude.com/docs/en/large-codebases#choose-between-per-directory-claude-md-and-path-scoped-rules)
- `@path` imports expand into the importing file, resolved relative to it, up to four
  hops deep.
  [memory › Import additional files](https://code.claude.com/docs/en/memory#import-additional-files)

## Why always-loaded files carry the fewest facts

When two loaded instructions contradict each other, Claude may follow either one. A
stale fact in a file every session loads does the most damage, so those files carry
rules and pointers, and current-state facts live where they load on demand.
[memory](https://code.claude.com/docs/en/memory)

## Upkeep the docs recommend

- Review `CLAUDE.md` edits in pull requests, revisit them after a major model release,
  and let a Stop hook propose updates from the session transcript.
  [large codebases › Layer CLAUDE.md files by directory](https://code.claude.com/docs/en/large-codebases#layer-claude-md-files-by-directory)
- `/doctor prompt-audit` reads the instruction files, rules and
  skills, and reports references to files or commands that do not exist and files that
  contradict each other; pass a path to audit one file or directory.
  [memory](https://code.claude.com/docs/en/memory)

## Load receipt

Take the receipt from a headless session, not from reasoning about the rules above.
Pick a sentence that exists only in the new nested file, then run both:

```bash
claude -p "Use the Read tool exactly once, on <a file in that directory>, and read no other file. Then, using only the instructions already in your context, quote the first sentence of <the rule>. If it is not in your instructions, answer exactly NOT LOADED." \
  --setting-sources project,local --allowedTools Read --model haiku
claude -p "Do not use any tool. Using only the instructions already in your context, quote the first sentence of <the rule>. If it is not in your instructions, answer exactly NOT LOADED." \
  --setting-sources project,local --allowedTools Read --model haiku
```

The first quotes the sentence and the second answers `NOT LOADED`. Add
`--output-format stream-json --verbose` to the first to confirm it read exactly one
file. `--setting-sources project,local` keeps user-level hooks out of the run.
