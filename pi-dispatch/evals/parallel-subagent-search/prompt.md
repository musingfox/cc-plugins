---
description: "Near miss: a plain parallel Agent fan-out with no offload or pi."
tags: [trigger, negative]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Use three subagents in parallel to search this codebase: one for every place we read environment variables, one for every HTTP client we create, and one for every TODO comment. Then summarize what they find.
