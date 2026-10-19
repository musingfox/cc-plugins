import { appendFileSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
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
  const listed = git(repoRoot, ["ls-tree", "-r", "-z", baseSha]);
  if (!listed.ok) throw new WorktreeError(`listing the tree at ${baseSha} failed`, listed.stderr);

  const lockfiles = new Map<string, { path: string; sha: string }[]>();
  for (const entry of listed.stdout.split("\0")) {
    const tab = entry.indexOf("\t");
    if (tab < 0) continue;
    const path = entry.slice(tab + 1);
    if (!LOCKFILES.has(path.slice(path.lastIndexOf("/") + 1))) continue;
    const dir = dirname(path);
    const sha = entry.slice(0, tab).split(" ")[2];
    lockfiles.set(dir, [...(lockfiles.get(dir) ?? []), { path, sha }]);
  }

  const outcomes = [...lockfiles.keys()].sort().map((dir): DepOutcome => {
    const drifted = lockfiles.get(dir)!.find(({ path, sha }) => {
      const now = git(repoRoot, ["hash-object", `--path=${path}`, join(repoRoot, path)]);
      return !now.ok || now.stdout !== sha;
    });
    if (drifted) {
      return { dir, outcome: "lockfile-differs", detail: drifted.path.slice(drifted.path.lastIndexOf("/") + 1) };
    }
    const src = join(repoRoot, dir, "node_modules");
    let stat;
    try {
      stat = lstatSync(src, { throwIfNoEntry: false });
    } catch (error) {
      return { dir, outcome: "no-node-modules", detail: (error as NodeJS.ErrnoException).code ?? String(error) };
    }
    if (stat?.isSymbolicLink()) return { dir, outcome: "no-node-modules", detail: "symlink" };
    if (!stat?.isDirectory()) return { dir, outcome: "no-node-modules" };
    const result = cloneDir(src, join(clone, dir, "node_modules"));
    return result.ok ? { dir, outcome: "copied" } : { dir, outcome: "clonefile-error", detail: result.detail };
  });
  if (outcomes.some((o) => o.outcome === "copied")) excludeNodeModules(clone);
  return outcomes;
}

// git clone does not carry the source's info/exclude, so a repo that ignores node_modules only there
// would let a worker's `git add -A` commit the copied tree.
function excludeNodeModules(clone: string): void {
  const where = git(clone, ["rev-parse", "--path-format=absolute", "--git-path", "info/exclude"]);
  if (!where.ok) return;
  const file = where.stdout;
  let current = "";
  try {
    current = readFileSync(file, "utf8");
  } catch {}
  if (current.split("\n").includes("node_modules/")) return;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${current === "" || current.endsWith("\n") ? "" : "\n"}node_modules/\n`);
}
