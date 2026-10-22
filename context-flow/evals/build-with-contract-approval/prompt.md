---
description: "Should trigger: build an agreed feature with a human approving the contract first."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Build the webhook retry queue we agreed on: exponential backoff, at most 5 attempts, a dead-letter table after that. I want to approve the contract before any code gets written.
