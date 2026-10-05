# Pre-commit Check Implementations

Source of truth for `.githooks/pre-commit`. Include only enabled checks.

Contents: Script Skeleton, Security / File Integrity / Structure checks, Quality checks (with commands per language), Customization.

## Script Skeleton

```bash
#!/usr/bin/env bash
set -euo pipefail

# Hook Guard Pre-commit (generated)

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
# grep wrapper for checks: rc 0 = match, 1 = no match; rc > 1 (grep error) is recorded as a failure
# and sets the calling check's local `found` (bash dynamic scope) so it does not also report a pass.
match() {
  local rc=0
  grep "$@" &>/dev/null || rc=$?
  if [ "$rc" -gt 1 ]; then fail "grep error (rc=$rc): grep $*"; found=1; fi
  return "$rc"
}

# ... check functions here ...

# --- Run ---
echo "hook-guard: running pre-commit checks..."
# Call each enabled check directly, one per line (check_secrets, check_large_files, ...).
# Every check returns 0 and records problems via fail/warn, so a finding never aborts
# the hook under `set -e`; the summary below decides the exit code.

echo ""
if [ $ERRORS -gt 0 ]; then
  echo "hook-guard: $ERRORS check(s) failed, $WARNINGS warning(s)"
  exit 1
fi
echo "hook-guard: all checks passed ($WARNINGS warning(s))"
exit 0
```

## Security, integrity, and structure checks

### Security

```bash
check_secrets() {
  echo "Checking for secrets..."
  if command -v gitleaks &>/dev/null; then
    gitleaks git --pre-commit --staged --no-banner 2>&1 || { fail "gitleaks detected potential secrets"; return; }
    pass "No secrets detected (gitleaks)"
    return
  fi
  local found=0
  # POSIX ERE only: BSD grep on macOS has no -P. Entries prefixed "i:" match case-insensitively.
  local patterns=(
    'AKIA[0-9A-Z]{16}'
    'i:(api[_-]?key|apikey)[[:space:]]*[=:][[:space:]]*[^[:space:]]{8,}'
    'i:(secret|password|passwd|token)[[:space:]]*[=:][[:space:]]*[^[:space:]]{8,}'
    'ghp_[A-Za-z0-9_]{36}'
    'sk-[A-Za-z0-9]{48}'
    'xox[bporas]-[A-Za-z0-9-]+'
  )
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    local diff; diff=$(git diff --cached -- "$file")
    for p in "${patterns[@]}"; do
      local opts=(-qE) re=$p rc=0
      case "$p" in i:*) opts=(-qiE); re=${p#i:} ;; esac
      grep "${opts[@]}" -e "$re" <<<"$diff" 2>/dev/null || rc=$?
      if [ "$rc" -eq 0 ]; then
        fail "Potential secret in $file (pattern: ${re:0:30}...)"; found=1
      elif [ "$rc" -gt 1 ]; then
        fail "Secret scan error (grep rc=$rc) on $file"; found=1
      fi
    done
  done
  if [ "$found" -eq 0 ]; then pass "No secrets detected (regex)"; fi
}

check_private_keys() {
  echo "Checking for private key files..."
  local found=0
  for file in $(staged_files); do
    case "$file" in *.pem|*.key|*.p12|*.pfx|*.jks|*.keystore)
      fail "Private key file staged: $file"; found=1 ;;
    esac
  done
  if [ "$found" -eq 0 ]; then pass "No private key files"; fi
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
  if [ "$found" -eq 0 ]; then pass "No sensitive files"; fi
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
  if [ "$found" -eq 0 ]; then pass "No large files"; fi
}

check_merge_conflicts() {
  echo "Checking for merge conflict markers..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    if match -E '^(<{7}|={7}|>{7})[[:space:]]' "$file"; then
      fail "Merge conflict markers in $file"; found=1
    fi
  done
  if [ "$found" -eq 0 ]; then pass "No merge conflict markers"; fi
}

# Mixed CRLF+LF; skip binaries
check_line_endings() {
  echo "Checking for mixed line endings..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    file --mime "$file" 2>/dev/null | grep -q "binary" && continue
    if match -q $'\r$' "$file" && match -qv $'\r$' "$file"; then
      warn "Mixed line endings (CRLF + LF) in $file"; found=1
    fi
  done
  if [ "$found" -eq 0 ]; then pass "Consistent line endings"; fi
}

check_trailing_whitespace() {
  echo "Checking for trailing whitespace..."
  local found=0
  for file in $(staged_files); do
    [ -f "$file" ] || continue
    file --mime "$file" 2>/dev/null | grep -q "binary" && continue
    if match -E '[[:space:]]+$' "$file"; then
      warn "Trailing whitespace in $file"; found=1
    fi
  done
  if [ "$found" -eq 0 ]; then pass "No trailing whitespace"; fi
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
  if [ "$found" -eq 0 ]; then pass "All files end with newline"; fi
}

check_broken_symlinks() {
  echo "Checking for broken symlinks..."
  local found=0
  for file in $(staged_files); do
    if [ -L "$file" ] && [ ! -e "$file" ]; then
      fail "Broken symlink: $file"; found=1
    fi
  done
  if [ "$found" -eq 0 ]; then pass "No broken symlinks"; fi
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
    if match -E "$NO_COMMIT_MARKERS" "$file"; then
      fail "No-commit marker in $file:"
      echo "    $(grep -nE "$NO_COMMIT_MARKERS" "$file" | head -3)"
      found=1
    fi
  done
  if [ "$found" -eq 0 ]; then pass "No commit markers found"; fi
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
        if python3 -c "import yaml" &>/dev/null; then
          python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null || { fail "Invalid YAML: $file"; found=1; }
        else
          warn "Skipped YAML check for $file (needs python3 with PyYAML)"
        fi ;;
      *.toml)
        if python3 -c "import tomllib" &>/dev/null; then
          python3 -c "import tomllib; tomllib.load(open('$file','rb'))" 2>/dev/null || { fail "Invalid TOML: $file"; found=1; }
        else
          warn "Skipped TOML check for $file (needs python3 >= 3.11 for tomllib)"
        fi ;;
    esac
  done
  if [ "$found" -eq 0 ]; then pass "File syntax valid"; fi
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

  if [ "$found" -eq 0 ]; then pass "Lock files consistent"; fi
}
```

## Quality checks

Substitute the detected tool command on the placeholder line; keep the `if … then pass … else fail … fi` around it so a failing tool is recorded instead of aborting the hook. If no tool detected for a category, omit the function — do not generate a no-op.

```bash
check_lint() {
  echo "Running lint..."
  if
    # [LINT_COMMAND]
  then pass "Lint passed"; else fail "Lint failed"; fi
}

check_format() {
  echo "Checking format..."
  if
    # [FORMAT_CHECK_COMMAND]  (check mode, not write)
  then pass "Format passed"; else fail "Format failed"; fi
}

check_test() {
  echo "Running tests..."
  if
    # [TEST_COMMAND]
  then pass "Test passed"; else fail "Test failed"; fi
}
```

### Commands per language (first available wins)

| Lang | Lint | Format (check) | Test |
|---|---|---|---|
| Python | `ruff check .` / `flake8 .` | `ruff format --check .` / `black --check .` | `pytest` / `python -m pytest` |
| JS/TS | `npx eslint .` / `npx biome lint .` | `npx prettier --check .` / `npx biome format .` | `npx vitest run` / `npx jest` / `npm test` |
| Rust | `cargo clippy -- -D warnings` | `cargo fmt -- --check` | `cargo test` |
| Go | `golangci-lint run` / `go vet ./...` | `out=$(gofmt -l .) && [ -z "$out" ]` | `go test ./...` |

## Customization

Apply overrides from `.claude/hook-guard.local.md`:

- Replace `FILE_SIZE_LIMIT` with `file_size_limit` (supports `500KB` / `2MB`).
- Replace `NO_COMMIT_MARKERS` (pipe-joined from array).
- Emit only checks whose `checks.*` setting is true.
- For lint/format/test: substitute real commands (no placeholders in output); omit category entirely if no tool detected.
