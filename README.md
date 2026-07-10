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

One skill, one script. Render markdown, Mermaid, or `~/.claude/plans/` files as formatted HTML:
- **Single Skill (`viz-render`)**: handles three input shapes — file path, plan name, or inline content (markdown/mermaid)
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

### Jujutsu (jj) VCS Helper

Workflow commands and Git-to-jj translation for [Jujutsu](https://github.com/martinvonz/jj):
- **5 Workflow Commands**: `/jj-status`, `/jj-sync`, `/jj-submit`, `/jj-clean`, `/jj-undo`
- **Natural Language VCS**: Describe operations like "split this change" or "squash the last two changes"
- **Git Translation**: Automatically translates Git terminology to jj equivalents in jj repos
- **Auto-Detection**: Supports both colocated (jj + git) and native jj repositories

**Installation:**
```bash
/plugin install jj
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

Development as a spiral of **converge → diverge**, built on one axiom: the non-deterministic world has only opinions, the deterministic world has only right/wrong — sort each piece of work correctly.
- **Two roles, isolated**: a **Convergence** subagent (vague idea → code + tests) and an independent **Divergence** subagent (judge against intent + adversarially hunt holes). Fresh context guarantees the judge never saw how the builder reasoned.
- **The machine**: a deterministic commit-gate hook blocks `git commit` when tests/lint fail — *a failing gate means not done*, enforced (not at the model's discretion) and bypass-proof.
- **The human is the decision-maker**: owns the criteria (approve the Specification-by-Example) and the STOP (ship, continue, or reframe), via in-flow gates.
- **Single command**: `/spiral "goal"` runs one turn — formalize → human-approve → build → gate → diverge → human-decide.

See `spiral/docs/concept.md` for the full concept.

**Installation:**
```bash
/plugin install spiral
```

### gog (Google Workspace)

Interact with Google Workspace services via the [gogcli](https://github.com/steipete/gogcli) CLI:
- **3 Specialized Skills**: Gmail, Calendar, Drive — each triggered by natural language
- **Gmail**: Search, send, reply, threads, labels, drafts, attachments
- **Calendar**: Events, create, update, delete, freebusy, conflicts, RSVP, focus-time, OOO
- **Drive**: List, search, upload, download, export, share, copy, move, permissions
- **Safety-First**: All destructive operations require `--dry-run` preview before execution
- **Prerequisites**: `brew install gogcli` + `gog auth add <email>`

**Installation:**
```bash
/plugin install gog
```

### MarkItDown

Convert non-plain-text files to Markdown using [MarkItDown](https://github.com/microsoft/markitdown):
- **Wide Format Support**: PDF, Word, PowerPoint, Excel, images, audio, HTML, EPUB, CSV, JSON, XML, ZIP
- **Auto-Triggered**: Activates when you ask to read, analyze, or summarize non-text files
- **Explicit Conversion**: `/convert` skill for direct file-to-markdown conversion
- **Prerequisite**: `pip install markitdown` or `uv tool install markitdown`

**Installation:**
```bash
/plugin install markitdown
```

### ADR (Architecture Decision Records)

Lifecycle management for [MADR 4.0](https://adr.github.io/madr/) Architecture Decision Records with cross-reference consistency enforcement:
- **Full Lifecycle**: Create, list, supersede, deprecate, check — all via natural language
- **Core Differentiator**: Supersession updates ALL cross-references across the entire repo, not just the old-new ADR pair
- **4-Layer Search**: Filename, ADR-N marker, markdown link, title substring — catches every reference
- **Categorized Updates**: Auto-update ADR/doc files, add markers to source code, skip config (user choice per category)
- **Reference Guard**: Advisory skill warns when editing `.md` files that reference superseded ADRs
- **Zero Dependencies**: Pure markdown instruction files, no CLI tools to install

**Installation:**
```bash
/plugin install adr
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

### Discord Webhook

Send Discord webhook notifications from Claude Code:
- **Dual Format**: Plain text `content` and rich Embed (title, description, color, fields, footer)
- **Multi-Webhook**: Route to named channels via `DISCORD_WEBHOOK_{NAME}` env vars
- **Flexible Config**: Environment variables or `.claude/discord-webhook.local.md` settings file
- **Composable**: Designed as a tool for other plugins, hooks, and agents to call
- **Slash Command**: `/discord-notify "message"` for direct usage and testing

**Installation:**
```bash
/plugin install discord-webhook
```

### pi-dispatch (Experimental)

Offload heavy work to [omp (oh-my-pi)](https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent) cheap/fast models so Claude only writes briefs and reviews summaries — saving tokens:
- **`agents/builder.md`**: brief-driven executor — when the brief embeds `pi-agent.sh` offload usage, builder operates it as a pure operator (`pi-agent.sh start` per task, `pi-agent.sh watch` as the main loop, run acceptance check, distill report); when the brief carries no offload usage, builder does the work itself. Builder does NOT choose the mode — the brief does.
- **`agents/reviewer.md`**: independent contract judge — given ONLY the contract, the deliverable paths, and the check output, returns an evidence-backed PASS/FAIL per clause; never sees the builder transcript, never runs offload verbs. Main dispatches builder and reviewer directly (no intermediary coordinator).
- **`pi-agent.sh`**: name-addressed unified verbs (`start/send/poll/peek/ls/stop/watch`) mirroring native sub-agent UX; `send` resumes a finished worker's session, `watch` feeds the Monitor tool for push notifications
- **`pi-dispatch.sh`**: launches one brief on a cheap/fast omp model in the background (default `grok-build`; `--profile fast|balanced|careful` or `PI_MODEL` to override), returns a run handle instantly — dispatch N briefs for parallel fan-out
- **`pi-poll.sh` / `pi-stop.sh`**: idempotent one-line status polls and group-kill cancel; `pi-worktree.sh` isolates parallel code-writing tasks in git worktrees
- **Claude reviews, workers write**: main thread issues briefs, collects diffs/summaries, and does the final review — all reading/reasoning/generation happens inside omp, off Claude's context
- **Prerequisite**: `omp` CLI installed and authenticated (`PI_BIN` selects another pi-compatible binary)

**Installation:**
```bash
/plugin install pi-dispatch
```

### Readability

Enhances AI-generated text readability:
- **Markdown Tables**: Properly aligned columns for terminal display
- **ASCII Art**: Well-formatted text-based diagrams
- **Text Diagrams**: Consistent formatting for visual elements

**Installation:**
```bash
/plugin install readability
```

## Plugin Development

This repository serves as both a marketplace and a development workspace for custom Claude Code plugins.

### Structure

```
cc-plugins/
├── .claude-plugin/
│   └── marketplace.json          # Marketplace configuration
├── omt/                          # OMT - One Man Team plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── agents/                   # 5 core agents (hive, pm, arch, dev, reviewer)
│   ├── commands/                 # omt, init-agents, approve, git-commit, help
│   ├── contracts/                # Agent contract definitions (hive, pm, arch, dev)
│   ├── docs/                     # Workflow, quick-start, contract-validation docs
│   ├── hooks/                    # PostToolUse state-sync hook
│   ├── lib/                      # contract-validator, state-manager
│   ├── skills/                   # contract-validation skill
│   └── README.md
├── viz/                          # Markdown & Mermaid HTML renderer
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── lib/                      # render.sh, template.html
│   └── skills/
│       └── viz-render/           # single skill — handles all input shapes
│           ├── SKILL.md
│           └── references/
│               └── diagram-types.md
├── jj/                           # Jujutsu VCS plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/                 # jj-status, jj-sync, jj-submit, jj-clean, jj-undo
│   ├── skills/                   # jj-workflow, git-to-jj
│   └── README.md
├── apple-podcasts/               # Apple Podcasts audio fetcher
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/                   # apple-podcasts-fetch
├── context-flow/                 # [Experimental] Context-flow pipeline
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── commands/
│   │   └── cf.md                 # Orchestrator — context flow + contract validation
│   └── agents/                   # research, plan, implement, review
├── gog/                          # Google Workspace CLI skills
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/                   # gog (single skill, references/{gmail,calendar,drive}.md)
├── markitdown/                   # File-to-Markdown converter
│   ├── .claude-plugin/
│   │   └── plugin.json
│   └── skills/                   # markitdown-read, convert
├── hook-guard/                   # Hook setup assistant
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # setup, doctor, update
│   └── README.md
├── readability/                  # Text formatting plugin
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # readable-text-formatting
│   └── README.md
├── adr/                          # ADR lifecycle management
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # adr (lifecycle), adr-ref-guard (advisory)
│   └── README.md
├── fizzy/                        # Fizzy project management
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # fizzy CLI wrapper
│   └── README.md
├── obsidian-workspace/           # Obsidian vault: capture, notes, PM
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # init, jot, pm
│   ├── templates/                # task / doc / adr + dashboard .base
│   └── README.md
├── discord-webhook/              # Discord webhook notifications
│   ├── .claude-plugin/
│   │   └── plugin.json
│   ├── skills/                   # discord-webhook (auto), discord-notify (slash cmd)
│   └── README.md
└── README.md
```

## License

MIT License - Personal use and modification encouraged
