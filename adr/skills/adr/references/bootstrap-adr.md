# Bootstrap ADR: 0000-use-madr.md

Create this file as `0000-use-madr.md` when initializing ADRs in a project for the first time. Replace `{today}` with the current date.

```markdown
---
status: accepted
date: {today}
decision-makers: ""
---

# Use MADR 4.0 for Architecture Decision Records

## Context and Problem Statement

We need a consistent format for documenting architecture decisions so that team members can understand the reasoning behind past choices and track the evolution of decisions over time.

## Decision Drivers

* Need a lightweight, version-controllable format
* Want machine-parseable metadata for tooling
* Must support decision lifecycle (proposed, accepted, superseded, deprecated)
* Should be widely adopted with community support

## Considered Options

* MADR 4.0 (Markdown Any Decision Records)
* adr-tools format (Nygard style)
* Custom format
* No formal format

## Decision Outcome

Chosen option: "MADR 4.0", because it provides YAML frontmatter for machine-parseable status tracking, follows a clear structure that guides decision documentation, and has strong community adoption.

### Consequences

* Good, because YAML frontmatter enables automated status parsing and tooling
* Good, because standardized sections ensure comprehensive decision documentation
* Good, because 4-digit numbering supports large decision histories
* Neutral, because team members need to learn the MADR template
* Bad, because slightly more verbose than minimal formats

### Confirmation

All new ADRs follow the MADR 4.0 template. Status field uses: proposed | accepted | deprecated | superseded by [ADR-NNNN](file).

## Pros and Cons of the Options

### MADR 4.0

Structured markdown with YAML frontmatter, standardized sections, active community.

* Good, because YAML frontmatter is machine-parseable
* Good, because well-documented with official examples
* Good, because supports decision lifecycle tracking
* Bad, because more sections than minimal alternatives

### adr-tools format (Nygard style)

Plain markdown with status in heading, simpler structure.

* Good, because simpler and shorter
* Bad, because no YAML frontmatter — status parsing requires regex
* Bad, because less structured — easier to omit important context

### Custom format

Team-defined format tailored to specific needs.

* Good, because fits team preferences exactly
* Bad, because no community support or tooling
* Bad, because harder to onboard new team members

### No formal format

Ad-hoc documentation of decisions.

* Good, because zero overhead
* Bad, because inconsistent documentation
* Bad, because no lifecycle tracking
* Bad, because decisions get lost or forgotten

## More Information

* [MADR on GitHub](https://adr.github.io/madr/)
* [ADR on GitHub](https://adr.github.io/)
```
