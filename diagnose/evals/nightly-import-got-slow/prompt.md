---
description: "Should trigger: a regression whose cause is unknown, fix explicitly deferred."
tags: [trigger, positive]
max_turns: 4
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill, Agent, TodoWrite]
---

The nightly import job went from 6 minutes to 25 minutes this week and nobody knows why. Find out what is actually causing the slowdown before we change anything.
