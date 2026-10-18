---
status: accepted
delivered:
depends: []
---

# muster: ACP-driven unattended worker sessions

## What this layer settles

muster is a new, independent Claude Code plugin. A coordinator session dispatches worker agent sessions that run unattended, each on a model chosen per ticket. Every worker is driven over ACP (Agent Client Protocol) by a client process that muster owns. That client enforces the permission policy, records every ACP message to the worker's event log, and escalates any request outside policy to the coordinator through files. pi-dispatch stays unchanged. Whether muster later replaces it is decided after muster supports a second agent kind.

## What is now concrete enough to build on

- **Pieces.** Each worker session has four things: its own git worktree; one muster client process that holds the agent's stdio; an `events.jsonl` with both directions of ACP traffic, timestamped; and a report file the worker writes when it finishes (`DONE` or `BLOCKED`). The coordinator reads report files and the event log. It never reads a transcript.
- **Permission policy.** A request whose paths are all inside the worker's worktree is allowed, whether it edits, writes, reads, searches, moves or deletes, with two exceptions: the run's own report file is allowed although it sits outside the worktree, and a path inside the worktree's `.git` always asks. For any other path request, and for any request kind the client does not recognize, the client writes a `QUESTION` file and blocks until the coordinator writes an `ANSWER` file. The prototype ran this round trip end to end with Claude (`git show spiral/prototype-acp-fleet-client:verdict.md`, Q2). Bash is not judged by the client: Claude Code's OS sandbox, sent on `session/new` as `_meta.claudeCode.options.sandbox`, confines Bash writes to the worktree and the system temp directories (denying temp broke Claude Code's own Bash cwd file), and Bash reads are not confined. Network is an allowlist (a short built-in list plus `MUSTER_ALLOW_HOSTS`): a host or web fetch outside it, and every web search, is refused without a `QUESTION`, so an unattended run never waits on the network (`git show spiral/prototype-muster-bash-sandbox:verdict.md`).
- **Claude is the first and only agent kind.** It goes through `@agentclientprotocol/claude-agent-acp`. That adapter runs on the user's Claude Code login with no API key; the prototype saw plan "max" reported and `claude-haiku-5-5` running as requested (verdict.md, Q1).
- **The client sets the session's permission mode itself, to `default`, on every session.** The user's `defaultMode: "auto"` is inherited otherwise, and in that mode an out-of-worktree write went through with no request (verdict.md, Q2).
- **The model is required at dispatch.** A dispatch without one is refused. Without an explicit model the worker runs on the user's default, and the earlier herdr experiment hit exactly that.
- **Success is never inferred from `stopReason`.** omp returned `end_turn` with an HTTP 404 as its message (verdict.md, surprises). Done means the report file exists and says `DONE`.
- Defaults I took (two-way doors): worktrees are created with plain `git worktree`, not `herdr worktree`, because herdr is no longer the control plane. herdr may still be used as a viewer later. Each agent kind is an adapter with three parts (launch, send, permission routing) plus a note on its fence. Only the Claude adapter is built at this layer.

## What is deliberately left to the next layer

- **The fence for a non-Claude agent.** omp's ACP gate does not ask before `write` (`@oh-my-pi/pi-coding-agent src/session/acp-permission-gate.ts:8-13, 72-95`; CHANGELOG.md:5535). Two fixes are possible: route writes through the client's `fs.writeTextFile` capability, which is untested, or reuse an OS sandbox the way pi-dispatch does. Choosing between them is premature until a second agent kind is actually wanted.
- **Worker context cost.** One Haiku prompt used about 110-150k tokens, mostly cache reads, because the adapter loads the user's whole Claude Code context. Whether and how to trim it, for example through setting sources or plugin selection, needs a measurement this layer did not take.
- **How the coordinator wakes up on a `QUESTION` or report file.** Monitor, polling, and `SendMessage` from the client are all candidates, and the choice is the next layer's grain.
- **Choosing a persona per ticket.** Plugin agents such as `cf:*` are selectable as an ACP config option. Whether muster exposes that is open.
- **Merging with pi-dispatch.** Decided after a second agent kind lands.

## What would overturn this

- `claude-agent-acp` starts billing through an API key, or the subscription stops covering SDK use. Then a Claude worker no longer saves anything, and muster's reason for ACP falls apart.
- Per-worker context cost cannot be brought well below the coordinator's own cost. Then parallelism saves wall-clock time but not tokens.
- A Claude session in `default` mode performs an out-of-worktree action without a permission request. Review did not see this happen, but it found a neighbouring gap: the client's own Bash parser allowed `git log --output=<outside path>`, which writes outside the worktree. Bash is therefore fenced by the OS sandbox instead of a parser; the item still applies to every tool the sandbox does not cover.
- Directions that lost: muster replacing pi-dispatch now lost because it widens scope and rewires cf before muster has proved itself. Extending pi-dispatch with ACP lost because it would carry 1573 existing lines through the change. A herdr pane as the control plane lost because the user wants workers that run unattended, and the pane is optional.

## Suggested skills

- `cf` implements this milestone: research, contracts, implement, review.
- `marketplace` keeps plugin.json, marketplace.json, and README.md in sync for the new plugin.
- `ctx7` (rule, not a skill) fetches the ACP TypeScript SDK docs before the client is written.
