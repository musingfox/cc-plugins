# Pre-commit Check Implementations

Source of truth for `.githooks/pre-commit`. Include only enabled checks.

## Script Skeleton

```bash
#!/usr/bin/env bash
set -euo pipefail

# Hook Guard Pre-commit (generated)

# --- CLAUDECODE skip ---
SKIP_LINT="${CLAUDECODE:+1}"
SKIP_FORMAT="${CLAUDECODE:+1}"
SKIP_TEST="${CLAUDECODE:+1}"

# --- Config ---
FILE_SIZE_LIMIT=512000  # 500KB
NO_COMMIT_MARKERS="DO NOT COMMIT|FIXME: remove|XXX|HACK"

# --- State ---
ERRORS=0
WARNINGS=0

# --- Helpers ---
staged_files() { git diff --cached --name-only --diff-filter=ACM; }
warn() { echo "  ⚠ $1"; WARNINGS=$((WARNINGS + 1)); }
fail() { echo "  ✗ $1"; ERRORS=$((ERRORS + 1)); }
pass() { echo "  ✓ $1"; }

# ... check functions here ...

# --- Run ---
echo "hook-guard: running pre-commit checks..."
# ... call check functions ...

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "hook-guard: $ERRORS check(s) failed, $WARNINGS warning(s)"
  exit 1
fi
echo "hook-guard: all checks passed ($WARNINGS warning(s))"
exit 0
```

## Always-run checks (never skipped by CLAUDECODE)

### Security

```bash
check_secrets() {
  echo "Checking for secrets..."
  if command -v gitleaks &>/dev/null; then
    gitleaks protect --staged --no-banner 2>&1 || { fail "gitleaks detected potential secrets"; return; }
    pass "No secrets detected (gitleaks)"
    return
  fi
  local found=0
  local patterns=(
    'AKIA[0-9A-Z]{16}'
    '(?i)(api[_-]?key|apikey)\s*[=:]\s*\S{8,}'
    '(?i)(secret|password|passwd|token)\s*[=:]\s*\S{8,}'
    'ghp_[A-Za-z0-9_]{36}'
    'sk-[A-Za-z0-9]{48}'
    'xox[bporas]-[A-Za-z0-9-]+'
  )
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    for p in "${patterns[@]}"; do
      if git diff --cached -- "$file" | grep -PE "$p" &>/dev/null; then
        fail "Potential secret in $file (pattern: ${p:0:30}...)"; found=1
      fi
    done
  done
  [ $found -eq 0 ] && pass "No secrets detected (regex)"
}

check_private_keys() {
  echo "Checking for private key files..."
  local found=0
  for file in $(staged_files); do
    case "$file" in *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore)
      fail "Private key file staged: $file"; found=1 ;;
    esac
  done
  [ $found -eq 0 ] && pass "No private key files"
}

check_sensitive_paths() {
  echo "Checking for sensitive file paths..."
  local found=0
  for file in $(staged_files); do
    case "$file" in
      .env|.env.*|*.env|credentials.json|token.json|*secret*|*credential*)
        fail "Sensitive file staged: $file"; found=1 ;;
    esac
  done
  [ $found -eq 0 ] && pass "No sensitive files"
}
```

### File Integrity

```bash
check_large_files() {
  echo "Checking for large files (>${FILE_SIZE_LIMIT} bytes)..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    local size; size=$(wc -c < "$file")
    if [ "$size" -gt "$FILE_SIZE_LIMIT" ]; then
      fail "Large file: $file ($(numfmt --to=iec "$size" 2>/dev/null || echo "${size} bytes"))"
      found=1
    fi
  done
  [ $found -eq 0 ] && pass "No large files"
}

check_merge_conflicts() {
  echo "Checking for merge conflict markers..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    if grep -nE '^(<{7}|={7}|>{7})\s' "$file" &>/dev/null; then
      fail "Merge conflict markers in $file"; found=1
    fi
  done
  [ $found -eq 0 ] && pass "No merge conflict markers"
}

# Mixed CRLF+LF; skip binaries
check_line_endings() {
  echo "Checking for mixed line endings..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    file --mime "$file" 2>/dev/null | grep -q "binary" && continue
    if grep -PlU '\r\n' "$file" &>/dev/null && grep -PlU '(?<!\r)\n' "$file" &>/dev/null; then
      warn "Mixed line endings (CRLF + LF) in $file"; found=1
    fi
  done
  [ $found -eq 0 ] && pass "Consistent line endings"
}

check_trailing_whitespace() {
  echo "Checking for trailing whitespace..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    file --mime "$file" 2>/dev/null | grep -q "binary" && continue
    if grep -nE '\s+$' "$file" &>/dev/null; then
      warn "Trailing whitespace in $file"; found=1
    fi
  done
  [ $found -eq 0 ] && pass "No trailing whitespace"
}

check_eof_newline() {
  echo "Checking for EOF newline..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    file --mime "$file" 2>/dev/null | grep -q "binary" && continue
    if [ -s "$file" ] && [ "$(tail -c 1 "$file" | wc -l)" -eq 0 ]; then
      warn "No newline at end of $file"; found=1
    fi
  done
  [ $found -eq 0 ] && pass "All files end with newline"
}

check_broken_symlinks() {
  echo "Checking for broken symlinks..."
  local found=0
  for file in $(staged_files); do
    if [ -L "$file" ] && [ ! -e "$file" ]; then
      fail "Broken symlink: $file"; found=1
    fi
  done
  [ $found -eq 0 ] && pass "No broken symlinks"
}
```

### Structure / Convention

```bash
check_no_commit_markers() {
  echo "Checking for no-commit markers..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    file --mime "$file" 2>/dev/null | grep -q "binary" && continue
    if grep -nE "$NO_COMMIT_MARKERS" "$file" &>/dev/null; then
      fail "No-commit marker in $file:"
      echo "    $(grep -nE "$NO_COMMIT_MARKERS" "$file" | head -3)"
      found=1
    fi
  done
  [ $found -eq 0 ] && pass "No commit markers found"
}

check_syntax_validation() {
  echo "Checking file syntax..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    case "$file" in
      *.json)
        if command -v jq &>/dev/null; then
          jq empty "$file" 2>/dev/null || { fail "Invalid JSON: $file"; found=1; }
        elif command -v python3 &>/dev/null; then
          python3 -c "import json; json.load(open('$file'))" 2>/dev/null || { fail "Invalid JSON: $file"; found=1; }
        fi ;;
      *.yaml|*.yml)
        command -v python3 &>/dev/null && \
          { python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null || { fail "Invalid YAML: $file"; found=1; }; } ;;
      *.toml)
        command -v python3 &>/dev/null && \
          { python3 -c "import tomllib; tomllib.load(open('$file','rb'))" 2>/dev/null || { fail "Invalid TOML: $file"; found=1; }; } ;;
    esac
  done
  [ $found -eq 0 ] && pass "File syntax valid"
}

# Warn when a manifest changes but its lock file isn't staged
check_lock_sync() {
  echo "Checking lock file consistency..."
  local found=0
  local staged; staged=$(staged_files)

  if echo "$staged" | grep -q "package.json" && \
     ! echo "$staged" | grep -qE "(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)"; then
    warn "package.json changed but lock file not staged"; found=1
  fi
  if echo "$staged" | grep -q "pyproject.toml" && \
     ! echo "$staged" | grep -qE "(uv\.lock|poetry\.lock|Pipfile\.lock)"; then
    warn "pyproject.toml changed but lock file not staged"; found=1
  fi
  if echo "$staged" | grep -q "Cargo.toml" && ! echo "$staged" | grep -q "Cargo.lock"; then
    warn "Cargo.toml changed but Cargo.lock not staged"; found=1
  fi

  [ $found -eq 0 ] && pass "Lock files consistent"
}
```

## Skippable checks (CLAUDECODE=1 skips)

Substitute the detected tool command. If no tool detected for a category, omit the function — do not generate a no-op.

```bash
check_lint() {
  [ "${SKIP_LINT:-}" = "1" ] && { pass "Lint (skipped — CLAUDECODE)"; return; }
  echo "Running lint..."
  # [LINT_COMMAND]
}

check_format() {
  [ "${SKIP_FORMAT:-}" = "1" ] && { pass "Format (skipped — CLAUDECODE)"; return; }
  echo "Checking format..."
  # [FORMAT_CHECK_COMMAND]  (check mode, not write)
}

check_test() {
  [ "${SKIP_TEST:-}" = "1" ] && { pass "Test (skipped — CLAUDECODE)"; return; }
  echo "Running tests..."
  # [TEST_COMMAND]
}
```

### Commands per language (first available wins)

| Lang | Lint | Format (check) | Test |
|---|---|---|---|
| Python | `ruff check .` / `flake8 .` | `ruff format --check .` / `black --check .` | `pytest` / `python -m pytest` |
| JS/TS | `npx eslint .` / `npx biome lint .` | `npx prettier --check .` / `npx biome format .` | `npx vitest run` / `npx jest` / `npm test` |
| Rust | `cargo clippy -- -D warnings` | `cargo fmt -- --check` | `cargo test` |
| Go | `golangci-lint run` / `go vet ./...` | `gofmt -l . \| grep -q .` | `go test ./...` |

## Customization

Apply overrides from `.claude/hook-guard.local.md`:

- Replace `FILE_SIZE_LIMIT` with `file_size_limit` (supports `500KB` / `2MB`).
- Replace `NO_COMMIT_MARKERS` (pipe-joined from array).
- Emit only checks whose `checks.*` setting is true.
- For lint/format/test: substitute real commands (no placeholders in output); omit category entirely if no tool detected.
