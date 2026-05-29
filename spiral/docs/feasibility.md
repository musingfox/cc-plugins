# Spiral — Platform Feasibility (Claude Code)

**Verdict: FEASIBLE.** All four concept roles map onto current Claude Code primitives. Two
structural constraints *shape* the architecture but do not block it. Findings are grounded
in current official Claude Code docs; experimental surfaces are flagged and must not carry
the hard gate.

---

## Role → primitive mapping (high confidence, primary docs)

| Concept role | Claude Code primitive | Notes |
|---|---|---|
| **The machine** (deterministic gate) | `PreToolUse` hook matching `Bash(git commit *)` → `permissionDecision: "deny"` or **exit 2** | Bypass-proof: a deny blocks the tool even under `--dangerously-skip-permissions`. This is the literal "failing gate = not done." |
| **Convergence role** | a named plugin agent (`agents/convergence.md`) | Runs in a fresh, isolated context window. |
| **Divergence role** | a named plugin agent (`agents/divergence.md`), **@-mentioned** to force it to run | Independence is structural: a fresh context cannot see the builder's history, skills, or files read. |
| **Decision-maker** (human anchor) | `AskUserQuestion` at the orchestrator (main thread) | NOT available inside subagents; ≤4 options per question. |
| **Spiral loop / nesting** | a slash command in the main thread that chains the agents per pass | NOT agent-recursion — see GAP 1. |

---

## Critical implementation traps

- **The gate must `exit 2`** (or emit `permissionDecision: "deny"` JSON). `exit 1` is
  treated as a non-blocking error and the action **proceeds** — a test runner's
  conventional exit 1 will NOT block.
- **Gate at COMMIT (`PreToolUse`), not at end-of-turn (`Stop`).** The Stop hook self-limits
  at 8 consecutive blocks (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`) and has a known plugin bug
  (#10412: exit-2 Stop hooks may *halt* instead of continue). `PreToolUse`-on-commit is the
  clean, high-confidence path; if a Stop gate is ever added, use the `decision:"block"` +
  `reason` (exit 0) form and test it under the plugin runtime.
- **Use NAMED agents, not fork mode.** `CLAUDE_CODE_FORK_SUBAGENT=1` inherits parent
  context and would break Convergence/Divergence independence.
- **Plugin agent frontmatter** supports: `name, description, model, effort, maxTurns,
  tools, disallowedTools, skills, memory, background, isolation` (only value: `worktree`).
  `hooks`, `mcpServers`, `permissionMode` are NOT supported in plugin-shipped agents.
- **Do not use experimental `agent` hooks for the hard gate** ("experimental and may
  change"). Use a plain `command` hook. Reserve `agent`/`prompt` hooks for advisory,
  non-blocking adversarial checks.
- Plugins ship hooks via `hooks/hooks.json`; bundled scripts are referenced through
  `${CLAUDE_PLUGIN_ROOT}`.

---

## Two structural gaps (shape, not block)

- **GAP 1 (high confidence) — subagents cannot spawn subagents.** The spiral loop
  (convergence↔divergence oscillation, and the nested "spiral of spirals") MUST be
  orchestrated by the main thread (a slash command / Skill that chains Convergence then
  Divergence per pass) — a Convergence agent cannot internally spawn a Divergence agent.
  This is consistent with the concept: the orchestrating main thread IS the decision-maker's
  seat, which is also the only place `AskUserQuestion` works.
- **GAP 2 (medium confidence) — peer-to-peer subagent messaging is missing/asymmetric** for
  Agent-tool-spawned subagents (`SendMessage` absent from their toolset; they can receive a
  parent message but not originate one). A "still-alive role answering a bounded
  clarification" needs **parent-side relay** — which is viable (the claim that relay
  "defeats coordination" was refuted 0-3). Native peer messaging exists only in
  `TeamCreate` teams (experimental). MVP does not need this.

---

## Proposed file layout

```
spiral/
  .claude-plugin/plugin.json
  commands/spiral.md        # main-thread orchestrator: one pass = converge → (commit gate) → diverge → human
  agents/convergence.md     # formalize (SbE Examples + feasibility verdict) + build
  agents/divergence.md      # independent judge + adversarial hunt + regenerate next seed
  hooks/hooks.json          # PreToolUse Bash(git commit *) → scripts/gate.sh
  scripts/gate.sh           # run tests/lint/types; exit 2 on fail (NEVER exit 1)
  docs/concept.md
  docs/feasibility.md
```

---

## Open questions (re-verify before/during build)

1. **Stop-hook plugin bug #10412** — moot if we gate at commit (`PreToolUse`); verify only
   if a Stop gate is ever added.
2. **Slash-command pause/resume on `AskUserQuestion`** — **RESOLVED: YES (interactive).**
   A plugin slash command runs as instructions in the MAIN conversation thread (not an
   isolated process), so it can call `AskUserQuestion` mid-flow, pause for the human, and
   continue — within a single interactive `/spiral` invocation, with no Agent SDK. Verified
   by primary evidence: `AskUserQuestion` is a live main-thread interactive tool, the
   first-party `/remember` command uses it (per the tool's own `metadata.source` example),
   and it was exercised live in this session. The Agent-SDK `canUseTool`/`defer` mechanism
   is needed ONLY for HEADLESS/programmatic runs where the process must exit and resume
   across a long human delay. **Implication:** the MVP (interactive) human gate works in
   one command run; a future headless mode would instead need state-file-based
   multi-invocation resumption (or the SDK defer pattern).
3. **Main-thread chaining depth** — since nesting is orchestrated from the main
   conversation, context accumulation may bound how many nested layers one session can
   descend.
4. **Frame-breaking** — no platform primitive to widen an agent's scope mid-flow; model it
   as the human choosing a different command/scope in the main thread.

---

## Build status & unexercised wiring (MVP)

The plugin is scaffolded and the gate **script logic** is unit-verified (dormant when no
turn is active; blocks `git commit` with exit 2 only when a turn is active and its checks
fail; ignores non-commit Bash). What is **NOT yet exercised** — and gates any claim that the
plugin "works":

1. **Keystone — the hook actually FIRES and BLOCKS in-session. ✅ VERIFIED (2026-05-29).**
   With the plugin installed/enabled and `.spiral/active` armed with a failing check, an
   in-session `git add -A && git commit` was **blocked**: no commit landed, the staged
   `.spiral/active` remained uncommitted, and the hook surfaced `SPIRAL GATE FAILED`.
   Confirmed independently via the test repo's `git log` (no new commit). The load-bearing
   guarantee of "the machine" holds for a plugin-shipped PreToolUse hook with exit 2.
   (Note: the hook registers at SESSION START — a mid-session install needs a restart before
   it fires; the first run silently passed because `.spiral/active` had never been created.)
2. **`subagent_type: "spiral:convergence"` / `"spiral:divergence"` resolve. ✅ VERIFIED.**
   Both named subagents resolved and ran in a `/spiral` run (FORMALIZE, BUILD, and the
   independent divergence judgment).
3. **AskUserQuestion pauses inside an installed command. ✅ VERIFIED.** The "approve
   Examples" and "STOP / continue" gates both paused mid-command for the human.

**Full loop ✅ VERIFIED (2026-05-29):** `/spiral "make src/answer.sh output 2"` ran
end-to-end — FORMALIZE (`feasible` + Examples + `GATE_CMD: bash test.sh`) → human approve →
BUILD (`echo 1`→`echo 2`) → commit gated and passed green → independent Divergence judged
the goal met and surfaced real test-fidelity holes (E2 looser than E1; exact bytes
unverified; cwd not pinned) as next-turn seeds, not silent fixes. Confirmed independently via
the test repo's git log + file contents. **Status: MVP works end-to-end; the machine, role
independence, and in-command human gating are all empirically verified.**

Notes from the run:
- The orchestrator's prose `.gitignore` setup was skipped on the first commit, so `.spiral/`
  state files were committed and then self-corrected (untracked + amended). FIXED: the commit
  step now explicitly `git reset -q -- .spiral` before committing, so state never enters a
  commit regardless of `.gitignore`. (Belt-and-suspenders with the setup `.gitignore` line.)
- The self-correction itself is a positive sign — the main-thread orchestrator has the agency
  to handle surprises — but state-hygiene should not depend on it; hence the deterministic fix.

Known sharp edges (acceptable for an experimental, human-in-the-loop MVP; flagged not fixed):
- `gate.sh` runs `eval "$gate_cmd"`, and later turns concatenate **Divergence-authored**
  check strings — LLM-authored text reaching `eval`. Mitigated only by the human approving
  the gate command at step 2; harden before any non-interactive use.
- The concept's "next turn starts higher" (accepted holes → next-turn gate checks) rests on
  the orchestrator LLM hand-reading/writing `.spiral/state.json` with no schema or
  enforcement. Moot at one turn; the multi-turn rise is unexercised — do not claim it works.

---

*Sources: official Claude Code docs — `code.claude.com/docs/en/{hooks, sub-agents,
plugins-reference, agent-teams, agent-sdk/user-input}` and
`docs.anthropic.com/en/docs/claude-code/{hooks, hooks-guide}`. The two gaps additionally
draw on GitHub issues #48160, #35240, #37051 (medium confidence — observed behavior framed
by reporters as patchable, not documented permanent design). Re-verify experimental
surfaces before relying on them.*
