import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const MUSTER = join(import.meta.dir, "..");
const SKIPPED = new Set([".test-runs", "node_modules"]);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED.has(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const claudeTests = walk(MUSTER)
  .filter((path) => /\.test\.tsx?$/.test(path))
  .map((path) => relative(MUSTER, path).split(sep).join("/"));

test("claude plugin test files all live under hooks/tests", () => {
  expect(claudeTests.length).toBeGreaterThan(0);
  for (const path of claudeTests) expect(path.startsWith("hooks/tests/")).toBe(true);
});

test("bun ignores the hooks directory", () => {
  expect(readFileSync(join(MUSTER, "bunfig.toml"), "utf8")).toContain("hooks/**");
});
