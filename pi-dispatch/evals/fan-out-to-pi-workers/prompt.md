---
description: "Should trigger: parallel fan-out addressed to pi workers."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Fan these three tasks out to pi workers in parallel: bump lodash to 4.17.21, fix the eslint warnings in src/utils, and add a CHANGELOG entry for 2.3.0.
