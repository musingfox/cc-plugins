# Hook Guard

One-stop hook setup assistant for Claude Code projects. Detects your project environment and generates git pre-commit and commit-msg scripts with security checks and code quality gates.

## Features

### Pre-commit Hooks (`.githooks/`)

**Security & integrity**:
- Secrets detection (gitleaks or regex fallback)
- Private key file detection (.pem, .key, .p12)
- Sensitive file path detection (.env, credentials.json)
- Large file check (configurable threshold)
- Merge conflict markers
- Mixed line endings (CRLF/LF)
- Trailing whitespace
- EOF newline
- Broken symlinks
- No-commit markers (DO NOT COMMIT, FIXME: remove, XXX, HACK)
- JSON / YAML / TOML syntax validation
- Lock file & manifest sync (package-lock.json ↔ package.json, etc.)

**Quality**:
- Lint
- Format
- Test

**Commit message** (`.githooks/commit-msg`):
- Conventional commits format validation

### Supported Languages

| Language | Lint | Format | Test |
|----------|------|--------|------|
| Python | ruff, flake8, pylint | ruff format, black | pytest |
| JS/TS | eslint, biome | prettier, biome | vitest, jest |
| Rust | clippy | rustfmt | cargo test |
| Go | golangci-lint | gofmt | go test |

## Skill

Single `hook-guard` skill dispatches by intent:

| Mode | Trigger | Purpose |
|---|---|---|
| Setup | "set up hooks", "configure pre-commit" | Detect → recommend → generate all hooks |
| Doctor | "check hooks", "hook health check" | Verify hook files, permissions, tools |
| Update | "update hooks", "refresh hook config" | Re-detect and apply changes |

## Installation

```bash
/plugin install hook-guard
```

## Usage

### Initial Setup

Ask Claude to set up hooks:

```
set up hooks for this project
```

Claude will:
1. Detect your project language and toolchain
2. Present a recommended configuration
3. Generate all hooks after your confirmation

### Health Check

```
run hook doctor
```

### Update After Changes

```
update my hooks
```

## How It Works

### Shared Git Hooks via `core.hooksPath`

Hook scripts are stored in `.githooks/` (committed to the repo) instead of `.git/hooks/` (local only). This enables sharing hooks across the team.

**Team onboarding** (one-time per clone):
```bash
git config core.hooksPath .githooks
```

### One Gate for Every Committer

Every check runs in pre-commit, for a person and for Claude Code alike. hook-guard writes no Claude Code hooks: linting each edit as it lands rarely changes the outcome, and a commit is the one point every change passes.

Installs from before 0.2.0 skip lint, format, and test when `CLAUDECODE` is set and rely on `.claude/settings.local.json` hooks that read `$CLAUDE_TOOL_ARG_*`, a variable Claude Code never sets, so Claude's commits go unchecked. Doctor flags this.

## Configuration

Create `.claude/hook-guard.local.md` to customize:

```yaml
---
file_size_limit: 500KB
no_commit_markers:
  - "DO NOT COMMIT"
  - "FIXME: remove"
  - "XXX"
  - "HACK"
checks:
  secrets: true
  large_files: true
  merge_conflicts: true
  line_endings: true
  trailing_whitespace: true
  eof_newline: true
  broken_symlinks: true
  no_commit_markers: true
  syntax_validation: true
  lock_sync: true
  conventional_commits: true
  file_naming: false
  license_header: false
lint: true
format: true
test_gate: true
---
```

## Requirements

- Git
- Bash 4+
- Language-specific tools (detected automatically)
- Optional: `gitleaks` for enhanced secrets detection, `jq` for JSON validation
