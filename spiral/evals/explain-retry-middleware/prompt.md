---
description: "Near miss: asks how existing code works, nothing to decide."
tags: [trigger, negative]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Read src/http/retry.ts and walk me through how our retry middleware decides when to give up.
