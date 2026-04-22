# Environment Detection Reference

Run all phases and collect into a structured inventory.

## Language Detection

Single Glob at project root:

```
{pyproject.toml,setup.py,setup.cfg,requirements.txt,Pipfile,package.json,tsconfig.json,Cargo.toml,go.mod,Gemfile,build.gradle,build.gradle.kts,pom.xml,Package.swift,CMakeLists.txt,Makefile}
```

| Marker | Language |
|---|---|
| `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`, `Pipfile` | Python |
| `package.json` (+ `tsconfig.json` ⇒ TypeScript) | JS / TS |
| `Cargo.toml` | Rust |
| `go.mod` | Go |
| `Gemfile` | Ruby |
| `build.gradle*`, `pom.xml` | Java / Kotlin |
| `Package.swift` | Swift |
| `CMakeLists.txt`, `Makefile` | C / C++ |

Record all detected languages. Note `"type": "module"` in `package.json` (affects hook script import syntax).

## Toolchain Detection

Check via `command -v <tool>` (not `which`). Wrap in `set -euo pipefail`.

**Python** — lint: `ruff` / `flake8` / `pylint`. Format: `ruff format` / `black` / `autopep8`. Test: `pytest` (or `unittest` built-in). If `pyproject.toml` present, configured tools (`[tool.*]`) take priority over merely-installed ones.

**JS/TS** — check `package.json` devDependencies first, fall back to `npx <tool> --version`. Lint: `eslint` / `biome`. Format: `prettier` / `biome`. Test: `vitest` / `jest` / `mocha` (also check `scripts.test`). Config files: `eslint.config.{js,mjs,cjs}`, `.eslintrc.*`, `.prettierrc*`, `biome.json{,c}`.

**Rust** — `cargo clippy`, `rustfmt`, `cargo test` (built-in).

**Go** — lint: `golangci-lint` / `staticcheck`. Format: `gofmt` (built-in) / `goimports`. Test: `go test` (built-in).

## VCS Detection

```bash
if [ -d ".jj" ] && [ -d ".git" ]; then echo "jj-colocated"
elif [ -d ".jj" ]; then echo "jj-native"
elif [ -d ".git" ]; then echo "git"
else echo "no-vcs"; fi
```

`jj-native` cannot install pre-commit hooks — warn and abort.

## Existing Hooks Inventory

Report all findings before proceeding; never silently overwrite.

```bash
set -euo pipefail
git config core.hooksPath 2>/dev/null && echo "FOUND: core.hooksPath"
[ -f .git/hooks/pre-commit ] && echo "FOUND: .git/hooks/pre-commit"
[ -d .githooks ] && echo "FOUND: .githooks/"
[ -f .pre-commit-config.yaml ] && echo "FOUND: pre-commit framework"
[ -d .husky ] && echo "FOUND: Husky"
[ -f .claude/settings.local.json ] && echo "FOUND: CC settings (check hooks key)"
{ [ -f lefthook.yml ] || [ -f lefthook.yaml ]; } && echo "FOUND: Lefthook"
```

## Monorepo Detection

Check: `package.json` → `workspaces`; `pnpm-workspace.yaml`; `Cargo.toml` → `[workspace].members`; or Glob `**/package.json`, `**/Cargo.toml`, `**/go.mod`, `**/pyproject.toml` — manifests at multiple depths ⇒ monorepo.

If monorepo: list each package (path, language, tools). Hooks install at repo root; scope checks to staged files per package.
