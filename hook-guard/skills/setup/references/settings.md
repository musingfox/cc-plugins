# Hook Guard Settings Reference

User overrides are stored in `.claude/hook-guard.local.md` with YAML frontmatter. Read this file at the start of setup, doctor, and update workflows. If the file does not exist, use the defaults below.

## Frontmatter Schema

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

## Field Descriptions

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `file_size_limit` | string | `500KB` | Max file size for large file check. Supports KB/MB suffixes. |
| `no_commit_markers` | string[] | see above | Patterns to detect in staged files. Pipe-joined for grep. |
| `checks.*` | boolean | see above | Enable/disable individual pre-commit checks. |
| `lint` | boolean | `true` | Enable lint in pre-commit (skipped when CLAUDECODE=1). |
| `format` | boolean | `true` | Enable format check in pre-commit (skipped when CLAUDECODE=1). |
| `test_gate` | boolean | `true` | Enable test in pre-commit (skipped when CLAUDECODE=1). Also controls PreToolUse test gate in Claude Code hooks. |

## Applying Overrides

During setup Phase 2 (recommendation):
1. Read `.claude/hook-guard.local.md` if it exists
2. Parse YAML frontmatter
3. Override default values with user settings
4. Present the merged configuration to the user for confirmation

During doctor:
- Validate that the settings file has valid YAML frontmatter
- Check that all field names are recognized (warn on unknown fields)
- Report the current configuration summary

During update:
- Read settings to determine which checks should be active
- Preserve user overrides when regenerating hooks
