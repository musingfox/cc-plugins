import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

export function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "muster-repo-"));
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
