# Environment Detection Reference

Detect the project environment before generating hook configurations. Run all detection phases and collect results into a structured inventory.

## Language Detection

Check for marker files at the project root to determine which languages are present. Use a single Glob call first for efficiency:

```
{pyproject.toml,setup.py,setup.cfg,requirements.txt,Pipfile,package.json,tsconfig.json,Cargo.toml,go.mod,Gemfile,build.gradle,build.gradle.kts,pom.xml,Package.swift,CMakeLists.txt,Makefile}
```

Interpret results:

| Marker file(s)                                                 | Language            |
| -------------------------------------------------------------- | ------------------- |
| `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`, `Pipfile` | Python              |
| `package.json`                                                 | JavaScript          |
| `package.json` + `tsconfig.json`                               | TypeScript          |
| `Cargo.toml`                                                   | Rust                |
| `go.mod`                                                       | Go                  |
| `Gemfile`                                                      | Ruby                |
| `build.gradle`, `build.gradle.kts`, `pom.xml`                 | Java/Kotlin         |
| `Package.swift`                                                | Swift               |
| `CMakeLists.txt`, `Makefile`                                   | C/C++               |

For JavaScript vs TypeScript: if `package.json` exists, check whether `tsconfig.json` is also present. If `package.json` contains `"type": "module"`, note that the project uses ES modules (affects import syntax in hook scripts).

A project may contain multiple languages. Record all detected languages.

## Toolchain Detection

For each detected language, probe for available tooling. Use `command -v <tool>` to check availability (not `which`). Wrap all checks in `set -euo pipefail`.

### Python

**Lint:**
- `ruff` -- check: `command -v ruff && ruff --version`
- `flake8` -- check: `command -v flake8 && flake8 --version`
- `pylint` -- check: `command -v pylint && pylint --version`

**Format:**
- `ruff format` -- same binary as ruff lint, check: `command -v ruff`
- `black` -- check: `command -v black && black --version`
- `autopep8` -- check: `command -v autopep8 && autopep8 --version`

**Test:**
- `pytest` -- check: `command -v pytest && pytest --version`
- `unittest` -- always available (built-in)

**Config detection:** If `pyproject.toml` exists, read its `[tool.*]` sections. Look for `[tool.ruff]`, `[tool.black]`, `[tool.pylint]`, `[tool.pytest.ini_options]`, `[tool.mypy]`. Configured tools take priority over merely-installed ones.

### JavaScript/TypeScript

**Lint:**
- `eslint` -- check: `package.json` devDependencies for `eslint`, or `npx eslint --version`
- `biome` -- check: `package.json` devDependencies for `@biomejs/biome`, or `npx biome --version`

**Format:**
- `prettier` -- check: `package.json` devDependencies for `prettier`, or `npx prettier --version`
- `biome` -- same binary as lint (biome handles both)

**Test:**
- `vitest` -- check: `package.json` devDependencies for `vitest`
- `jest` -- check: `package.json` devDependencies for `jest`
- `mocha` -- check: `package.json` devDependencies for `mocha`
- Also check `package.json` `scripts.test` for the configured test runner

**Config detection:** Check for `eslint.config.js`, `eslint.config.mjs`, `eslint.config.cjs`, `.eslintrc.*` (`.json`, `.js`, `.yml`, `.yaml`, `.cjs`), `.prettierrc`, `.prettierrc.*`, `biome.json`, `biome.jsonc`. Configured tools take priority.

### Rust

**Lint:**
- `clippy` -- check: `cargo clippy --version`

**Format:**
- `rustfmt` -- check: `rustfmt --version`

**Test:**
- `cargo test` -- always available (built-in)

### Go

**Lint:**
- `golangci-lint` -- check: `command -v golangci-lint && golangci-lint --version`
- `staticcheck` -- check: `command -v staticcheck && staticcheck --version`

**Format:**
- `gofmt` -- always available (built-in with Go toolchain)
- `goimports` -- check: `command -v goimports`

**Test:**
- `go test` -- always available (built-in)

## VCS Detection

Determine the version control system in use:

1. **git only**: `.git/` directory exists, `.jj/` does not. Standard hook support.
2. **jj colocated**: both `.jj/` and `.git/` exist. Hooks run via the git layer. Use git hooks path.
3. **jj native**: `.jj/` exists without `.git/`. Warn the user: native jj does not support pre-commit hooks. Hook-guard cannot install hooks in this configuration.

Check with:

```bash
set -euo pipefail
if [ -d ".jj" ] && [ -d ".git" ]; then
  echo "jj-colocated"
elif [ -d ".jj" ]; then
  echo "jj-native"
elif [ -d ".git" ]; then
  echo "git"
else
  echo "no-vcs"
fi
```

## Existing Hooks Detection

Check for any pre-existing hook infrastructure. Report all findings so the user can make an informed decision about conflicts.

Run these checks in order:

1. **Custom hooks path** -- `git config core.hooksPath`. If set, record the path. This means hooks do NOT live in `.git/hooks/`.

2. **Direct hook files** -- Check `.git/hooks/pre-commit`. If it exists and does NOT end in `.sample`, an active hook is present. Read its first few lines to identify what it does.

3. **Project hooks directory** -- Check for `.githooks/` directory. If it exists, list its contents.

4. **pre-commit framework** -- Check for `.pre-commit-config.yaml`. If present, the project uses the `pre-commit` framework. Read the file to understand configured hooks.

5. **Husky** -- Check for `.husky/` directory. If present, the project uses Husky. Check `.husky/pre-commit` for existing hook content.

6. **Claude Code hooks** -- Check `.claude/settings.local.json`. If it exists, parse the JSON and check for a `hooks` key. Report any existing hook configurations.

7. **Lefthook** -- Check for `lefthook.yml` or `lefthook.yaml`. If present, the project uses Lefthook.

```bash
set -euo pipefail

echo "=== Existing Hooks Inventory ==="

# 1. Custom hooks path
HOOKS_PATH=$(git config core.hooksPath 2>/dev/null || echo "")
if [ -n "$HOOKS_PATH" ]; then
  echo "FOUND: core.hooksPath = $HOOKS_PATH"
fi

# 2. Direct pre-commit hook
if [ -f ".git/hooks/pre-commit" ]; then
  echo "FOUND: .git/hooks/pre-commit (active hook file)"
fi

# 3. Project hooks directory
if [ -d ".githooks" ]; then
  echo "FOUND: .githooks/ directory"
fi

# 4. pre-commit framework
if [ -f ".pre-commit-config.yaml" ]; then
  echo "FOUND: .pre-commit-config.yaml (pre-commit framework)"
fi

# 5. Husky
if [ -d ".husky" ]; then
  echo "FOUND: .husky/ directory (Husky)"
fi

# 6. Claude Code hooks
if [ -f ".claude/settings.local.json" ]; then
  echo "FOUND: .claude/settings.local.json (check for hooks key)"
fi

# 7. Lefthook
if [ -f "lefthook.yml" ] || [ -f "lefthook.yaml" ]; then
  echo "FOUND: lefthook config (Lefthook)"
fi
```

If any existing hooks are found, present the full inventory to the user before proceeding. Do not silently overwrite or bypass existing hooks.

## Monorepo Detection

Determine whether the project is a monorepo with multiple packages.

Check for workspace configuration:

1. **npm/yarn workspaces** -- Read `package.json` and check for a `"workspaces"` field.
2. **pnpm workspaces** -- Check for `pnpm-workspace.yaml`.
3. **Cargo workspaces** -- Read `Cargo.toml` and check for a `[workspace]` section with `members`.
4. **Multiple manifests** -- Use Glob to find package manifests at different directory depths:
   ```
   **/package.json
   **/Cargo.toml
   **/go.mod
   **/pyproject.toml
   ```
   If manifests appear at more than one directory level, the project is likely a monorepo.

If a monorepo is detected:

- List each package with its path, detected language, and available tools.
- Note that hooks should run only on staged files within each package's scope.
- Record the workspace root path for hook installation (hooks install at the repo root, not per-package).
