---
description: "Should trigger: delegate work to a headless worker and collect its report."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Delegate the changelog cleanup to a headless worker, then check its report once it finishes.
