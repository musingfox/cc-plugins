---
description: "Should trigger unasked: a code-changing milestone with a checkable done condition, no worker named."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Add rate limiting to the login endpoint: the sixth attempt from one IP within a minute gets a 429. It is done when a test proving that passes, committed on its own branch.
