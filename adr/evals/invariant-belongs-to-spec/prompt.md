---
description: "Near miss: a rule that must hold across runs, which belongs to spec."
tags: [trigger, negative]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Write down the rule that every handler under api/ must call authorize() before touching the database, as something that holds across all future runs and can be verified.
