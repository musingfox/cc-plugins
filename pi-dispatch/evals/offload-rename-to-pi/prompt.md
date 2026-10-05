---
description: "Should trigger: names pi and offloading."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Offload this to pi: rename every fetchUser call to getUser across src/ and run the tests. I don't want to burn Claude tokens on it.
