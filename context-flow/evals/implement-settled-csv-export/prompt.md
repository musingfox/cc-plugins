---
description: "Should trigger: implement a feature whose scope is already settled."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Implement CSV export for the reports page. The scope is settled: a button on /reports downloads the currently filtered rows as UTF-8 CSV through a new GET /reports/export endpoint. Build it, and check with me at the key decisions.
