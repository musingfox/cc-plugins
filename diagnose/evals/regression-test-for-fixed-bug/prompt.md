---
description: "Near miss: a test for a bug whose cause is already known and fixed."
tags: [trigger, negative]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

Yesterday we merged a fix for the crash when checkout runs with an empty cart. Write a regression test for it so it stays fixed.
