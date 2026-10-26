#!/usr/bin/env bash
# No file under method/ names a plugin or path the method plugin replaced. The
# pattern is built from pieces so this file does not match itself.
# NO set -e

. "$METHOD_TESTS_DIR/lib/assert.sh"

ROOT="$(cd "$METHOD_TESTS_DIR/.." && pwd)"
pat='context''-flow|cf''(:|-(scope|revert-gate|add-repros))|spiral'':|spiral''/(agents|scripts|commands|docs)|\.spiral''/|spiral''/prototype|CF''_[A-Z_]+'

hits="$(grep -rEn "$pat" "$ROOT" || true)"
assert_eq "" "$hits" "no method file names a retired plugin seat, script or path"

# check-contracts.sh points at the schema the method skill carries.
assert_contains "$(sed -n 1,4p "$ROOT/scripts/check-contracts.sh")" "method/skills/method/contracts.md" "check-contracts.sh header points at contracts.md"
