# ADR Audit

Run these checks and report grouped by severity. The first three groups ask whether each ADR is well-formed; the fourth asks whether it should exist at all.

## ERRORS (must fix)

- **Broken links**: Markdown links to non-existent ADR files. Scan all `.md` files for links matching `NNNN-*.md`, verify target exists.
- **Circular supersession**: A -> B -> A. Follow supersession chains, detect cycles.

## WARNINGS (should fix)

- **Stale references**: Files referencing superseded ADRs without a supersession notice. Use the 4-layer search pattern (SKILL.md, supersede Step 4) for each superseded ADR.
- **Missing frontmatter**: ADR files without `status` or `date` fields in YAML frontmatter.
- **Orphaned supersession**: Status says "superseded by X" but X doesn't contain "Supersedes" back-reference in its More Information section.

## WARRANT (judgment — never auto-act)

Apply the Decision Warrant Test (SKILL.md) to every ADR whose status is `proposed` or `accepted`. Skip the bootstrap ADR and anything already superseded or deprecated. Where to read the evidence:

- **Condition 3 (trade-off)** — "Considered Options". Mechanical: fewer than two real options (empty, a single entry, or one option plus "do nothing") fails.
- **Condition 1 (hard to reverse)** — "Context and Problem Statement" and "Consequences". Undoable by an ordinary code change, with no migration, data loss, or external commitment, fails.
- **Condition 2 (confusing without context)** — "Decision Outcome". A rationale that only restates the decision ("we use X because X is standard") fails.

Report one `[unwarranted]` line per ADR naming the failed condition. The default suggestion is deprecate, never supersede — there is no replacement decision. The user decides; never edit an ADR on this finding.

## INFO

- **Supersession chains**: A -> B -> C (3+ links). Suggest simplification.
- **Numbering gaps**: Missing numbers in the sequence. Informational only.

## Output format

```
ADR Audit:

ERRORS (2):
  [broken-link] docs/setup.md:15 links to 0009-missing.md — file does not exist
  [circular] ADR-0003 -> ADR-0007 -> ADR-0003

WARNINGS (1):
  [stale-ref] README.md:42 references ADR-0003 (superseded by ADR-0007)

WARRANT (1):
  [unwarranted] ADR-0005: Use Prettier — no trade-off (1 option considered) — suggest deprecate

INFO (1):
  [gap] Missing numbers: 0004, 0006

Summary: 2 errors, 1 warning, 1 unwarranted, 1 info
```

If errors or warnings found, suggest running supersede or manual fixes. Warrant findings are for the user to act on.
