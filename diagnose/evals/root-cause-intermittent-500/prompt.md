---
description: "Should trigger: explicit root-cause request with a symptom."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Our checkout endpoint started returning 500s intermittently after last Tuesday's deploy. I don't want a quick patch. Root-cause it and give me a failing test that reproduces it.
