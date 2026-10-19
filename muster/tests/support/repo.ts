import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function git(cwd: string, args: string[]): string {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString().trim();
}

// Outside /tmp, /private/tmp and $TMPDIR, the roots parseRunArgs refuses, whatever TMPDIR is.
const roots = new Set<string>();
export function removeFixtures(): void {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  roots.clear();
}

export function mkdirOutsideTemp(prefix: string): string {
  const parent = join(realpathSync(homedir()), ".cache");
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, prefix));
  roots.add(dir);
  return dir;
}

export function makeRepo(): string {
  const dir = mkdirOutsideTemp("muster-repo-");
  git(dir, ["init", "-q"]);
  git(dir, ["config", "core.hooksPath", "/dev/null"]);
  commitFile(dir, "README.md", "one\n", "first");
  return dir;
}

export function commitFile(repo: string, file: string, content: string, message: string): string {
  writeFileSync(join(repo, file), content);
  git(repo, ["add", file]);
  git(repo, ["commit", "-q", "-m", message]);
  return git(repo, ["rev-parse", "HEAD"]);
}
