---
name: glossary
description: >-
  Terminology for CONTEXT.md. Use when a word is overloaded, or when a
  concept conflicts with CONTEXT.md. For architecture invariants, use spec.
---

# Domain glossary

Adapted from [mattpocock/skills](https://github.com/mattpocock/skills)
`domain-modeling` (MIT, Copyright (c) 2026 Matt Pocock),
commit 3cca18b368ae95cdbdebbff572ccafa662551015. Upstream's CONTEXT-MAP.md is
not imported.

Read `${CLAUDE_PLUGIN_ROOT}/skills/glossary/references/context-format.md` before the first write.

## Where it lives

CONTEXT.md sits at the repo root. Create it when the first term is resolved —
not earlier, and not under `docs/spec/`. Specs live there; the glossary does not.

## What goes in

A term belongs here when it names a thing in the problem domain. Write what it IS.
CONTEXT.md is a glossary and nothing else.

The words layer, port, adapter, seam, module, and interface stay out of CONTEXT.md.
Domain words keep their own meaning; those six are design terms. The mirror
rule is context-flow's Design Vocabulary — it need not list every one of them.

## Clean architecture

Entities and use cases take their names from this glossary.

## During the session

Leave the ADR warrant to adr. These five moves are the glossary's job.

### Stop on a conflict

If CONTEXT.md already defines Order as a customer's purchase and the user says
"order" for a warehouse restock, stop. Ask which they mean. Do not pick one
and carry on.

### One precise name

When a word is doing two jobs, pick one. "Ticket" as a support case is not
the same as a seat at a show. Name one of them something else and list the
lost word under `_Avoid_`.

### Concrete scenarios

Push a relationship until the edge is visible. If refunds and shipments share
a customer, ask what happens when the refund lands after the parcel has already
left the warehouse.

### Cross-check the code

When they say how a refund works, open the refund path and quote it. If the
code only voids a whole payment and they just described a partial refund, say
so and ask which is right.

### Write back immediately

Write the settled term into CONTEXT.md the moment it is resolved. Do not wait
until the session ends.
