---
description: "Should trigger: an agent needs to know what constrains the files it will touch."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Before I change anything in src/payments, which specs constrain those files? Slice out the ones that apply.
