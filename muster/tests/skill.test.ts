import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MUSTER_ROOT = join(import.meta.dir, "..");
const SKILL = readFileSync(join(MUSTER_ROOT, "skills", "muster", "SKILL.md"), "utf8");
const PLACEHOLDER = "${CLAUDE_PLUGIN_ROOT}";
const LITERAL_CMD = "${CLAUDE_PLUGIN_ROOT}/src/muster.ts";

function frontmatter(text: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error("SKILL.md has no frontmatter");
  const fields: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2];
  }
  return fields;
}

function body(text: string): string {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "");
}

type Fence = { content: string };

function fences(text: string): Fence[] {
  return [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ content: m[1] }));
}

function helpVerbs(): string[] {
  const proc = Bun.spawnSync(["bun", join(MUSTER_ROOT, "src", "muster.ts"), "--help"]);
  expect(proc.exitCode).toBe(0);
  return proc.stdout.toString().split("\n").filter((line) => line !== "");
}

describe("CoordinatorSkill", () => {
  test("T1: frontmatter names the skill and its description mentions dispatch and worker", () => {
    const fm = frontmatter(SKILL);
    expect(fm.name).toBe("muster");
    expect(fm.description).toContain("dispatch");
    expect(fm.description).toContain("worker");
  });

  test("T2: every 'muster.ts <word>' in a code block names a verb in --help", () => {
    const verbs = helpVerbs();
    const words = fences(body(SKILL)).flatMap((f) =>
      [...f.content.matchAll(/muster\.ts\s+(\S+)/g)].map((m) => m[1]),
    );
    expect(words.length).toBeGreaterThan(0);
    for (const word of words) expect(verbs).toContain(word);
  });

  test("T3: every fenced line that mentions muster.ts uses the literal plugin-root path", () => {
    const lines = fences(body(SKILL)).flatMap((f) => f.content.split("\n"));
    const cmds = lines.filter((line) => line.includes("muster.ts"));
    expect(cmds.length).toBeGreaterThan(0);
    for (const line of cmds) expect(line).toContain(LITERAL_CMD);
  });

  test("T4: body names run_in_background, --model, read-only commands, and the unfenced bun test and git commit hooks", () => {
    const text = body(SKILL);
    expect(text).toContain("run_in_background");
    expect(text).toContain("--model");
    expect(text).toContain("read-only commands");
    expect(text).toContain("bun test");
    expect(text).toContain("git commit");
    expect(text).toContain("hook");
    expect(text).toContain("not fenced");
  });

  test("T5: the plugin-root placeholder appears only inside non-heredoc code fences", () => {
    const text = body(SKILL);
    const outside = text.replace(/```[^\n]*\n[\s\S]*?```/g, "");
    expect(outside).not.toContain(PLACEHOLDER);
    for (const f of fences(text)) {
      if (/<<\s*['"]?\w+/.test(f.content)) expect(f.content).not.toContain(PLACEHOLDER);
    }
  });
});
