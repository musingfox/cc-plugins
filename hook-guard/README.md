# Hook Guard

One-stop hook setup assistant for Claude Code projects. Detects your project environment, generates Claude Code hooks and git pre-commit scripts with security checks, code quality gates, and CLAUDECODE skip logic.

## Features

### Claude Code Hooks (`.claude/settings.local.json`)

- **PostToolUse — Lint & Format**: Auto-runs after every Edit/Write (soft feedback)
- **PreToolUse — Test Gate**: Blocks `git commit` / `jj commit` if tests fail (hard gate)
- **CLAUDECODE env var**: Signals pre-commit hooks to skip redundant checks

### Pre-commit Hooks (`.githooks/`)

**Always run** (security & integrity):
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

**Skip when CLAUDECODE=1** (already handled by CC hooks):
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

## Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| **setup** | "set up hooks", "configure pre-commit" | Detect → recommend → generate all hooks |
| **doctor** | "check hooks", "hook health check" | Verify hook files, permissions, tools |
| **update** | "update hooks", "refresh hook config" | Re-detect and apply changes |

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

### CLAUDECODE Skip Logic

When Claude Code runs, it sets `CLAUDECODE=1` via `.claude/settings.local.json`. The pre-commit hook detects this and skips lint/format/test checks that Claude Code hooks have already handled. Security and integrity checks always run.

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
