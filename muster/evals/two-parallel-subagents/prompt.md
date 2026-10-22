---
description: "Near miss: an in-session parallel Agent fan-out with no worker or ticket."
tags: [trigger, negative]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Use two subagents in parallel: one lists every TODO comment in this repo, the other lists every environment variable we read. Then summarize what they found.
