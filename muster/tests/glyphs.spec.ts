import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// WHY this list: these marks were measured present in at least 10 of 16 common monospace fonts (Fira Code, Hack Nerd Font
// Mono, Menlo, Monaco, SF Mono, Courier New, Andale Mono, JetBrains Mono, Source Code Pro, Cascadia Mono, DejaVu Sans Mono,
// Noto Sans Mono, IBM Plex Mono, Inconsolata, Ubuntu Mono, Space Mono) on 2026-11-08. `✓ ✗ ▾ ▸ ◌ ☰ ↳ ↩ ∅ ⌘ ⏎ ╴` were
// rejected because most of those fonts lack them, and a missing glyph is borrowed from another font and breaks column
// alignment. `›` was measured present in all 16 and joined the list after the first draft left it out.
const ALLOWED = new Set([..."…●?○√×◊■▼►→↑↓¶≡»ø·—─│├└█░›"]);

// Every hooks file that draws a mark for the pane or the band; a new file for marks goes here.
const DRAWN_BY = ["register.ts", "band-model.ts"];

// Whole-line, trailing ` // ` and block comments are dropped; a `//` inside a string or regex has no space before it.
const codeOf = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const strays = (text: string): string[] => [...new Set([...codeOf(text)].filter((char) => char.charCodeAt(0) > 127 && !ALLOWED.has(char)))];

test("the pane and the band draw only marks from the measured list", () => {
  for (const name of DRAWN_BY) {
    expect([name, strays(readFileSync(join(import.meta.dir, "..", "hooks", name), "utf8"))]).toEqual([name, []]);
  }
});

test("the check sees a stray mark in code and ignores one in a comment", () => {
  expect(strays("const a = '✓';")).toEqual(["✓"]);
  expect(strays("const a = 1; // ✓ done\n// ✓\n/* ✓ */")).toEqual([]);
});
