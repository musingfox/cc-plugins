# MADR 4.0 Template

Use this template when creating new ADRs. Replace every `{placeholder}` in the sections you keep. Decision Drivers, Confirmation, and Pros and Cons of the Options are optional, as in the official MADR 4.0.0 template; drop a section rather than fill it with filler.

```markdown
---
status: proposed
date: {today}
decision-makers: ""
---

# {Title}

## Context and Problem Statement

{Describe the context and problem.}

<!-- optional: remove if unused -->
## Decision Drivers

* {Decision driver 1}
* {Decision driver 2}

## Considered Options

* {Option 1}
* {Option 2}
* {Option 3}

## Decision Outcome

Chosen option: "{Option}", because {justification}.

### Consequences

* Good, because {positive consequence}
* Bad, because {negative consequence}

<!-- optional: remove if unused -->
### Confirmation

{How will compliance with this decision be confirmed?}

<!-- optional: remove if unused -->
## Pros and Cons of the Options

### {Option 1}

{Description}

* Good, because {argument}
* Bad, because {argument}

### {Option 2}

{Description}

* Good, because {argument}
* Bad, because {argument}

### {Option 3}

{Description}

* Good, because {argument}
* Bad, because {argument}

## More Information

{Additional context, links to related ADRs, resources.}
```
