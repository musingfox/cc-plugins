import { dirname, join } from "node:path";
import { cloneDirectory, type CloneResult } from "./clonefile";
import { git, WorktreeError } from "./worktree";

const LOCKFILES = new Set(["bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

export type DepOutcome = {
  dir: string;
  outcome: "copied" | "lockfile-differs" | "no-node-modules" | "clonefile-error";
  detail?: string;
};

export function copyDeps(
  input: { repoRoot: string; baseSha: string; clone: string },
  cloneDir: (src: string, dst: string) => CloneResult = cloneDirectory,
): DepOutcome[] {
  const { repoRoot, baseSha, clone } = input;
  const listed = git(repoRoot, ["ls-tree", "-r", "-z", "--name-only", baseSha]);
  if (!listed.ok) throw new WorktreeError(`listing the tree at ${baseSha} failed`, listed.stderr);

  const dirs = new Set<string>();
  for (const path of listed.stdout.split("\0")) {
    if (LOCKFILES.has(path.slice(path.lastIndexOf("/") + 1))) dirs.add(dirname(path));
  }

  return [...dirs].sort().map((dir): DepOutcome => {
    cloneDir(join(repoRoot, dir, "node_modules"), join(clone, dir, "node_modules"));
    return { dir, outcome: "copied" };
  });
}
