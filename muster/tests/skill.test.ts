import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ALLOWED_HOSTS } from "../src/sandbox.ts";

const MUSTER_ROOT = join(import.meta.dir, "..");
const SKILL = readFileSync(join(MUSTER_ROOT, "skills", "muster", "SKILL.md"), "utf8");
const PLACEHOLDER = "${CLAUDE_PLUGIN_ROOT}";
const LITERAL_CMD = "${CLAUDE_PLUGIN_ROOT}/src/muster.ts";
const OLD_FENCE_FIXTURE = `## Fence limits

A worker does not get the main session's permissions.

- Worker Bash runs only read-only commands (ls, cat, grep, git status, git log, and similar), \`bun test\`, and \`git add\` or \`git commit\`.
- \`bun test\` and git commit hooks are not fenced; whatever they run is outside the fence.
`;

function bashFenceClaims(text: string): string[] {
  const claims: string[] = [];
  if (text.includes("read-only commands")) claims.push("read-only commands");
  if (/not fenced/i.test(text)) claims.push("not fenced");
  return claims;
}

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

  test("T4: body names run_in_background, --model, the sandbox confinement, the allowlist variable, BLOCKED, and unconfined reads; claims nothing about temp directories", () => {
    const text = body(SKILL);
    expect(text).toContain("run_in_background");
    expect(text).toContain("--model");
    expect(text).toContain("sandbox");
    expect(text).toContain("MUSTER_ALLOW_HOSTS");
    expect(text).toContain("BLOCKED");
    expect(text).toMatch(/reads? (are )?not confined/i);
    expect(text).not.toMatch(/temp director(y|ies)[^.\n]*denied/i);
    expect(text).not.toMatch(/MUSTER_HOME[^.\n]*temp/i);
  });

  test("R1: the confinement section says the system temp directories stay writable and never asks to keep MUSTER_HOME out of temp", () => {
    const text = body(SKILL);
    expect(text).toMatch(/temp[^\n]{0,80}writable|writable[^\n]{0,80}temp/i);
    expect(text).toMatch(/worktree and the system temp directories/i);
    expect(text).not.toMatch(/MUSTER_HOME[^.\n]*temp/i);
  });

  test("T6: body carries no old Bash text-fence claims, and the previous fence text fails the same checks", () => {
    expect(bashFenceClaims(body(SKILL))).toEqual([]);
    expect(bashFenceClaims(OLD_FENCE_FIXTURE).length).toBe(2);
  });

  test("K1: the skill describes a per-run clone and cleanup by removing the run directory, with no git worktree commands", () => {
    const text = body(SKILL);
    expect(text).not.toMatch(/git worktree/i);
    expect(text).toMatch(/\bclone\b/i);
    const cleanup = /## Cleanup\n([\s\S]*?)(?=\n## |$)/.exec(text)?.[1] ?? "";
    expect(cleanup).toMatch(/rm -r/);
    expect(cleanup).toContain("RUNDIR");
  });

  test("K2: the confinement section names the denied credential stores and the run-directory tool cache", () => {
    const text = body(SKILL);
    for (const store of [".npmrc", ".config/gh", ".git-credentials", ".netrc", ".aws", ".docker/config.json", "Library/Keychains"]) {
      expect(text).toContain(store);
    }
    expect(text).toContain("npm_config_cache");
    expect(text).toContain("BUN_INSTALL_CACHE_DIR");
  });

  test("K3: the skill says a file request inside the worktree's .git or .claude directory becomes a question", () => {
    const text = body(SKILL);
    expect(text).toMatch(/\.git[^\n]*\.claude[^\n]*question|question[^\n]*\.git[^\n]*\.claude/);
  });

  test("T7: the default-hosts paragraph lists exactly DEFAULT_ALLOWED_HOSTS", () => {
    const text = body(SKILL);
    for (const host of DEFAULT_ALLOWED_HOSTS) expect(text).toContain(host);
    const paragraph = text.split(/\n\s*\n/).find((p) => /default hosts/i.test(p)) ?? "";
    const named = [...paragraph.matchAll(/`([a-z0-9-]+(?:\.[a-z0-9-]+)+)`/g)].map((m) => m[1]);
    expect([...named].sort()).toEqual([...DEFAULT_ALLOWED_HOSTS].sort());
  });

  test("D1: the status section and the root README muster section document deps=", () => {
    const readme = readFileSync(join(MUSTER_ROOT, "..", "README.md"), "utf8");
    expect(body(SKILL)).toContain("deps=");
    expect(readme).toContain("deps=");
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
