---
description: "Should trigger: audit whether the specs still hold."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Audit whether our specs still hold: verify each accepted invariant against the current code.
