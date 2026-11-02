---
name: rex
description: Use the rex CLI to manage Rex sessions, open tabs, arrange panes, run commands, inspect terminal output, and control connected Rex apps. Also use when watching agent workers (Claude Code, pi) running in Rex panes.
---
<!-- Extends the stub "rex skill setup" installs (metadata rex-stub "2"); without that marker setup leaves this file alone. Re-check the stub with "rex skill setup --dry-run --force" after a Rex upgrade. -->

Run `rex __internal skill` and follow the guide it prints. The guide comes from
the installed Rex CLI, so it describes the commands available in that version.

If the command fails, the installed Rex version predates the guide. Start with
`rex whoami --json`, then use `rex --help` and `rex COMMAND --help`.

## Watching agents in panes

An agent's state comes from the program status it reports (OSC 7501), not from its screen. Never infer it by scraping `rex capture`: old turns' output stays on screen.

- To wait for an agent, run `rex do ~/.agents/skills/rex/scripts/agent-wait.lua -s S -b B until=done,blocked timeout=600`. It returns the matching record as JSON. Exit 124 means it timed out, and exit 3 means the pane is gone.
- After `rex send` a follow-up, add `fresh=true`, so the previous turn's `done` does not satisfy the wait.
- To read the state once, run `rex block call -s S -b B program_status`. Save the output in a variable and check the exit code before parsing; a closed pane exits 3 ("not found").
- Claude Code reports `working`, `blocked` and `done`. During AskUserQuestion it reports `blocked` with `kind=question`, and `msg` holds the question.
- Empty `records` is not idle: the program has not reported yet, for example while the folder-trust dialog blocks the session from starting. Capture the pane to see what it waits on.
