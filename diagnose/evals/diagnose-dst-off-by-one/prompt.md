---
description: "Should trigger: the word diagnose plus an observed wrong result."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Diagnose why parseDate('2026-03-08T02:30') in our scheduler returns the wrong hour. The logs show it is off by one hour, but only around DST changes.
