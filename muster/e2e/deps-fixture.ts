// Acceptance repo with an installed, git-ignored node_modules whose pairs share inodes.
// The ticket steps exercise the worker's copy: a clone must not reach back into the source.

import { existsSync, linkSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function writeDepsFixture(repo: string): void {
  if (!existsSync(repo)) throw new Error(`fixture repo does not exist: ${repo}`);
  writeFileSync(join(repo, "package.json"), '{"name":"deps-fixture","private":true}\n');
  writeFileSync(join(repo, ".gitignore"), "node_modules/\n");
  writeFileSync(join(repo, "bun.lock"), '{"lockfileVersion":1,"workspaces":{"":{"name":"deps-fixture"}},"packages":{}}\n');
  writeFileSync(join(repo, "deps-check.ts"), 'import { value } from "fixture-dep";\nconsole.log(value);\n');

  const dep = join(repo, "node_modules", "fixture-dep");
  mkdirSync(dep, { recursive: true });
  writeFileSync(join(dep, "package.json"), '{"name":"fixture-dep","main":"index.js"}\n');
  writeFileSync(join(dep, "index.js"), "export const value = 'fixture-dep-ok';\n");
  for (const [first, second] of [
    ["a.bin", "b.bin"],
    ["c.bin", "d.bin"],
    ["e.bin", "f.bin"],
  ]) {
    writeFileSync(join(dep, first), `${first}\n`);
    linkSync(join(dep, first), join(dep, second));
  }
}

const STEPS = [
  "bun deps-check.ts > deps-import.txt",
  "echo tampered >> node_modules/fixture-dep/a.bin",
  ": > node_modules/fixture-dep/c.bin",
  "rm node_modules/fixture-dep/e.bin",
];

export function depsTicketSteps(first: number): string[] {
  return STEPS.map((cmd, i) => `${first + i}. In Bash, run exactly this command and nothing else: ${cmd}`);
}
