#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

fail() { echo "  ✗ $*"; exit 1; }

script="$PWD/spiral/scripts/render-decision.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Nested so every viz lookup render-decision makes stays inside $tmp, where a
# stub render.sh records that a render happened instead of opening a browser.
root="$tmp/a/b/spiral"
mkdir -p "$root" "$tmp/a/b/viz/lib"
printf '#!/usr/bin/env bash\ntouch "%s/rendered"\necho "URL: http://localhost:0/x"\n' "$tmp" > "$tmp/a/b/viz/lib/render.sh"

brief() {
  cat > "$tmp/brief.md" <<EOF
---
viz: feedback
title: t
d1.title: 用哪個資料庫？
d1.options: Postgres | SQLite
d1.choice:${1:-}
d1.notes:
d2.title: 要不要快取？
d2.options: Redis ｜ 不要快取
d2.choice:
d2.notes:
notes:
---

## 用哪個資料庫？

| 候選 | 好處 | 代價 | 改回成本 |
|---|---|---|---|
| **Postgres** | a | b | 中 |
| ${2:-SQLite} | a | b | **高**：c |

| 發現 | 證據 | 後果 |
|---|---|---|
| free text | x | y |

## 要不要快取？

| 候選 | 好處 | 代價 | 改回成本 |
|---|---|---|---|
| Redis | a | b | 低 |
| 不要快取 | a | b | 低 |
EOF
}

run() {
  rm -f "$tmp/rendered"
  set +e
  out="$(LC_ALL=en_US.UTF-8 CLAUDE_PLUGIN_ROOT="$root" bash "$script" "$tmp/brief.md" n 2>&1)"
  rc=$?
  set -e
}

brief
run
[ "$rc" -eq 0 ] || fail "T1: a clean brief must render, exit $rc: $out"
[ -f "$tmp/rendered" ] || fail "T1: a clean brief must reach the renderer"
printf '%s\n' "$out" | grep -q 'save-mode=browser' || fail "T1: a clean brief must print save-mode"

brief '  # leave empty'
run
[ "$rc" -ne 0 ] || fail "T2: a pre-filled d1.choice must be refused"
[ ! -f "$tmp/rendered" ] || fail "T2: a pre-filled d1.choice must not render"
printf '%s\n' "$out" | grep -qF 'd1.choice' || fail "T2: the refusal must name d1.choice"

brief '' 'SQLite (embedded)'
run
[ "$rc" -ne 0 ] || fail "T3: a row label missing from d1.options must be refused"
[ ! -f "$tmp/rendered" ] || fail "T3: a row label missing from d1.options must not render"
printf '%s\n' "$out" | grep -qF 'SQLite (embedded)' || fail "T3: the refusal must name the label"

brief
sed -i.bak 's/^notes:$/notes: x/' "$tmp/brief.md"
run
[ "$rc" -ne 0 ] || fail "T4: a pre-filled round-level notes must be refused"
[ ! -f "$tmp/rendered" ] || fail "T4: a pre-filled round-level notes must not render"
