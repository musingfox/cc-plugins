---
description: "Should trigger: write down a verifiable rule that must survive across runs."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Write down this invariant so it survives across runs: no module outside src/billing may import the Stripe SDK. Make it verifiable.
