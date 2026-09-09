# Nick's Claude Code Plugin Marketplace

Personal marketplace for Claude Code plugins focused on developer productivity and Agent-First workflows.

## Installation

Add this marketplace to your Claude Code:

```bash
/plugin marketplace add musingfox/cc-plugins
```

## Available Plugins

### OMT - One Man Team

Your personal development squad powered by Agent-First workflow:
- **5 Core Agents**: @hive (lifecycle coordinator), @pm (requirements), @arch (architecture), @dev (TDD implementation), @reviewer (code review + commit)
- **Contract-First Design**: Defined input/output contracts between agents (`hive.json`, `pm.json`, `arch.json`, `dev.json`)
- **One Command**: `/omt "goal"` → autonomous planning → consensus gate → execution
- **Quality Assurance**: Automated code review and git commit workflows
- **State Synchronization**: PostToolUse hooks for automatic state tracking

**Installation:**
```bash
/plugin install omt
```

### Viz — Markdown & Mermaid HTML Renderer

Visual output across the whole spectrum — inline chat shapes for short explanations, browser HTML for long documents:
- **`viz-render`**: handles three input shapes — file path, plan name, or inline content (markdown/mermaid)
- **`viz-inline`**: compact in-chat visuals (call trees, pseudocode, diff-on-shape, component trees) for short explanations and code-shape discussions; hands off to viz-render above ~20 lines (adapted from HumanLayer's show-me, MIT)
- **Full Markdown**: syntax highlighting, KaTeX math, Mermaid, scroll animations, dark mode, TOC
- **Plans Resolution**: bare name → looks up `~/.claude/plans/*.md`; no argument → lists available plans
- **Proactive Triggers**: auto-renders when terminal would show a 4+ row / 3+ column table, a comparison, audit, feature matrix, or 50+ lines of structured content
- **Zero Runtime Deps**: CDN libraries (marked.js, DOMPurify, Mermaid.js, Highlight.js, KaTeX, AOS)

**Installation:**
```bash
/plugin install viz
```

**Sandbox configuration:** viz writes HTML output to `/tmp/viz/`. If sandbox is enabled, add to your `.claude/settings.json` or `~/.claude/settings.json`:
```json
{
  "sandbox": {
    "filesystem": {
      "allowWrite": ["//tmp/viz"]
    }
  }
}
```

### Apple Podcasts

Fetch Apple Podcasts episode audio download URLs:
- **iTunes API Pipeline**: Resolves episode audio URLs via iTunes Lookup API + RSS feed parsing
- **Zero Browser**: No scraping needed — pure HTTP API workflow
- **Auto-Triggered**: Activated when you share an Apple Podcasts URL or ask to download podcast audio

**Installation:**
```bash
/plugin install apple-podcasts
```

### Context Flow (Experimental)

Experimental agentic workflow based on the **Context + Goal + Tools** principle:
- **Core Idea**: Agents are defined by what context they see and what tools they have — not by role-based personas
- **4-Phase Pipeline**: Research → Plan → Implement → Review, with contract validation between phases
- **Contract as Context**: Each phase's output schema serves as binding constraints for the next phase, enforced structurally (not via prompt)
- **Minimal Agent Definitions**: Agent prompts are 1-16 lines; constraints come from context isolation and tool restrictions
- **Human Gate**: Plan review before implementation — the highest-leverage review point
- **Single Command**: `/cf "goal"` runs the full pipeline

**Installation:**
```bash
/plugin install context-flow
```

### Spiral (Experimental)

Narrows a vague question into an implementation-sized goal, one layer at a time — **diverge → you answer → probe → converge** — for the layers where there is no compiler: strategy, approach, milestones.
- **Divergence names the options**: an isolated subagent lists the decisions this layer can settle now and the genuinely *distinct* candidates for each, sorted by cost to reverse (one-way vs two-way door). It describes; it never decides, and it never re-lists last round.
- **A round, not a question**: every decision that is independent right now is asked at once, and only the one-way doors — the reversible ones get a default and a line in the plan. Answering some and leaving others blank is a legitimate answer; what you settle is what makes the rest askable.
- **Probes walk what you cannot settle from the page**: where candidates only differ once you take them, cheap throwaway descents run one per candidate and report the first hard thing each hits. A candidate that collides is dropped on evidence, never put to a vote. Where reading cannot settle it, a probe escalates to a **prototype** that builds and runs the smallest thing giving a red/green signal.
- **Convergence lands a layer**: what you settled becomes a plan or milestone — what this layer settles, what is concrete enough to build on, what it deliberately leaves to the next layer, and what would overturn it. Load-bearing facts cite their source.
- **You own both directions**: the decision page renders in the browser; the depth gate afterwards is a one-line ask in the terminal, on a plan you already have. Dig another layer, stop, or — when a layer falsifies what the one above it rested on — go back up and retake that decision. It only widens again when you ask.
- **Output is a goal, not code**: the run is promoted to `docs/milestones/<slug>.md`, composed from every layer that still stands — `.spiral/` is scratch, the milestone outlives it — then handed to `/cf` as a seed, not a contract set. No gate, nothing merged. A prototype may build a throwaway thing to settle a decision, but its code is evidence, abandoned on its own branch.
- **Single command**: `/spiral "the question"`.

See `spiral/docs/concept.md` for the full concept.

**Installation:**
```bash
/plugin install spiral
```

### ADR (Architecture Decision Records)

Lifecycle management for [MADR 4.0](https://adr.github.io/madr/) Architecture Decision Records with cross-reference consistency enforcement:
- **Full Lifecycle**: Create, list, supersede, deprecate, audit — all via natural language
- **Warrant Test**: Three conditions — hard to reverse, confusing without context, a real trade-off — gate creation and flag existing ADRs that fail them
- **Core Differentiator**: Supersession updates ALL cross-references across the entire repo, not just the old-new ADR pair
- **4-Layer Search**: Filename, ADR-N marker, markdown link, title substring — catches every reference
- **Categorized Updates**: Auto-update ADR/doc files, add markers to source code, skip config (user choice per category)
- **Zero Dependencies**: Pure markdown instruction files, no CLI tools to install

**Installation:**
```bash
/plugin install adr
```

### Spec (Architecture Spec Library)

Invariants and forward-looking interface contracts as verifiable, sliceable entries:
- **What must not change**, not why we chose it — complements ADR (history) with load-bearing constraints
- **Scope by file globs**: globs match the code; module names are their own drift source
- **`slice <path>...`**: prints the entries constraining those paths, ready to paste into a worker's brief — a spec nobody reads is a document, one that injects itself is a constraint
- **`verify`**: runs every accepted entry's check; a check that would false-positive is downgraded to prose and reported as debt every run
- **Forward-looking contracts**: describe an interface before it exists — the case code cannot cover

**Installation:**
```bash
/plugin install spec
```

### agent-browser

Browser automation and Playwright test authoring:
- **`agent-browser`**: live browser control via the agent-browser CLI — open URLs, snapshot pages, click/fill/screenshot, inspect elements. Ref-based interaction (`@e1`, `@e2`) from the accessibility tree instead of fragile CSS selectors
- **`playwright`**: write or set up `@playwright/test` E2E tests — specs, locators, assertions, fixtures, config
- **`web-test`**: debug a live page and convert the findings into Playwright regression tests — the debug-to-test workflow

**Installation:**
```bash
/plugin install agent-browser
```

### Hook Guard

One-stop hook setup assistant for Claude Code projects:
- **Auto-Detection**: Detects project language, toolchain (ruff/eslint/clippy/prettier/rustfmt/pytest/vitest...), VCS type, and existing hooks
- **Claude Code Hooks**: Generates PostToolUse lint/format (soft feedback) and PreToolUse test gate (hard gate) into `.claude/settings.local.json`
- **Pre-commit Scripts**: Generates `.githooks/pre-commit` with security checks (secrets, private keys, sensitive files), file integrity checks (large files, merge conflicts, line endings), and structure checks (no-commit markers, syntax validation, lock sync)
- **CLAUDECODE Skip Logic**: Pre-commit skips lint/format/test when Claude Code is running (already handled by CC hooks)
- **Conventional Commits**: Optional `.githooks/commit-msg` validation
- **Team-Shareable**: Uses `core.hooksPath` pointing to `.githooks/` (committed to repo)
- **3 Skills**: `setup` (detect + generate), `doctor` (health check), `update` (diff + refresh)

**Installation:**
```bash
/plugin install hook-guard
```

### Fizzy

Interact with [Fizzy](https://fizzy.do) via the Fizzy CLI for project management:
- **Full CLI Coverage**: Boards, cards (20 subcommands), columns, comments, steps, reactions, tags, users, notifications, pins, webhooks, account settings
- **Search & Filter**: Full-text search, time-based filters, assignee/tag/column filtering
- **File Uploads**: Inline images and background images via signed uploads
- **Board Migration**: Copy boards across accounts with `--dry-run` support
- **Prerequisites**: `fizzy` CLI installed and authenticated (`fizzy setup`)

**Installation:**
```bash
/plugin install fizzy
```

### Obsidian Workspace

Personal Obsidian vault productivity — capture, notes, and project management through the Obsidian CLI (skills-only, runs directly in the main context):
- **Jot** (`/obw:jot`): Quick capture (timestamped journal bullet) or long-form note — triages by input shape; filename strategies (title / slug / timestamp-title), `--folder` overrides per-call
- **Project Management** (`/obw:pm`): Task/doc/ADR lifecycle, Bases dashboards, wikilink cross-references
- **Interactive Init** (`/obw:init`): Guided setup of `.obsidian.yaml` — vault binding, note/pm sections
- **Prerequisites**: Obsidian app + CLI enabled, `.obsidian.yaml` config in project root

**Installation:**
```bash
/plugin install obsidian-workspace
```

### pi-dispatch (Experimental)

Offload heavy work to [pi](https://github.com/earendil-works/pi) cheap/fast models so Claude only writes briefs and reviews summaries — saving tokens:
- **`agents/builder.md`**: brief-driven executor — when the brief embeds `pi-agent.sh` offload usage, builder operates it as a pure operator (`pi-agent.sh start` per task, `pi-agent.sh watch` as the main loop, run acceptance check, distill report); when the brief carries no offload usage, builder does the work itself. Builder does NOT choose the mode — the brief does.
- **`agents/reviewer.md`**: independent contract judge — given ONLY the contract, the deliverable paths, and the check output, returns an evidence-backed PASS/FAIL per clause; never sees the builder transcript, never runs offload verbs. Main dispatches builder and reviewer directly (no intermediary coordinator).
- **`pi-agent.sh`**: name-addressed unified verbs (`start/send/poll/peek/ls/stop/watch`) mirroring native sub-agent UX; `send` resumes a finished worker's session, `watch` feeds the Monitor tool for push notifications
- **`pi-dispatch.sh`**: launches one brief on a cheap/fast pi model in the background (routed by `PI_PROVIDER`/`PI_MODEL`), returns a run handle instantly — dispatch N briefs for parallel fan-out
- **`pi-poll.sh` / `pi-stop.sh`**: idempotent one-line status polls and group-kill cancel; `pi-worktree.sh` isolates parallel code-writing tasks in git worktrees
- **Claude reviews, workers write**: main thread issues briefs, collects diffs/summaries, and does the final review — all reading/reasoning/generation happens inside pi, off Claude's context
- **Prerequisite**: `pi` CLI installed and authenticated (`PI_BIN` selects another pi-compatible binary)

**Installation:**
```bash
/plugin install pi-dispatch
```

### Wizard

Generate an interactive bash wizard that walks a human through steps only they can perform — ported from [mattpocock/skills](https://github.com/mattpocock/skills) (`wizard`), MIT, Copyright (c) 2026 Matt Pocock:
- **Human-only stages**: Dashboard logins, credential capture, CI secret writes, one-off migrations — never the steps the agent can run itself
- **Template UX**: Stage progress, confirmation gates, cross-platform URL opening, hidden secret entry, idempotent `.env` upserts, `gh secret`/`gh variable` writes
- **Author stages only**: Copy the library template; do not hand-edit above the `STAGES` marker
- **Ephemeral by default**: Built for one run and deleted when done; commit only as a repeatable setup path

**Installation:**
```bash
/plugin install wizard
```

## Plugin Development

This repository serves as both a marketplace and a development workspace for custom Claude Code plugins.

### Structure

Every plugin directory carries `.claude-plugin/plugin.json`; the rest is its components.

```
cc-plugins/
├── .claude-plugin/marketplace.json   # Marketplace configuration
├── .claude/skills/marketplace/       # Repo-internal: add/modify a plugin, version bump, sync
├── adr/                skills: adr
├── agent-browser/      skills: agent-browser, playwright, web-test
├── apple-podcasts/     skills: apple-podcasts-fetch
├── context-flow/       commands: cf  · agents: research, plan, implement, review · scripts, tests
├── fizzy/              skills: fizzy
├── hook-guard/         skills: hook-guard
├── obsidian-workspace/ skills: init, jot, pm · templates
├── omt/                skills: contract-validation · agents, commands, contracts, lib
├── pi-dispatch/        skills: pi-dispatch · agents: builder, reviewer · scripts, tests
├── spec/               skills: spec · scripts: spec.sh
├── spiral/             commands: spiral · agents: divergence, probe, prototype · scripts
├── viz/                skills: viz-inline, viz-render · lib, tests
├── wizard/             skills: wizard
└── README.md
```

## License

MIT License - Personal use and modification encouraged
