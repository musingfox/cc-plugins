import { existsSync, realpathSync, rmSync } from "node:fs";

export class WorktreeError extends Error {
  constructor(
    message: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "WorktreeError";
  }
}

export interface WorkerWorktreeInput {
  repoRoot: string;
  baseRef: string;
  name: string;
  worktreePath: string;
}

export interface WorkerWorktree {
  worktree: string;
  branch: string;
  baseSha: string;
}

function git(repoRoot: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  return {
    ok: proc.exitCode === 0,
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
  };
}

export function createWorkerWorktree(input: WorkerWorktreeInput): WorkerWorktree {
  const { repoRoot, baseRef, name, worktreePath } = input;
  const branch = `muster/${name}`;

  const base = git(repoRoot, ["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`]);
  if (!base.ok) {
    throw new WorktreeError(`base ref not found: ${baseRef}`, base.stderr);
  }
  const baseSha = base.stdout;

  const existed = existsSync(worktreePath);
  const cloned = Bun.spawnSync(["git", "clone", "-q", "--no-hardlinks", "--no-checkout", repoRoot, worktreePath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const switched = cloned.exitCode === 0 ? git(worktreePath, ["switch", "-q", "-c", branch, baseSha]) : undefined;
  if (cloned.exitCode !== 0 || !switched?.ok) {
    if (!existed) rmSync(worktreePath, { recursive: true, force: true });
    const stderr = cloned.exitCode !== 0 ? cloned.stderr.toString().trim() : (switched?.stderr ?? "");
    throw new WorktreeError(`creating the clone for ${branch} failed: ${stderr}`, stderr);
  }

  return { worktree: realpathSync(worktreePath), branch, baseSha };
}

// The leading + is needed because the worker may rewrite its branch (amend, rebase).
// Fully qualified source and --no-tags: a tag the worker makes in the clone must neither be imported nor outrank the branch.
export function fetchBranchBack(input: {
  repoRoot: string;
  clone: string;
  branch: string;
}): { ok: true; sha: string } | { ok: false; error: string } {
  const { repoRoot, clone, branch } = input;
  const fetched = git(repoRoot, [
    "-c",
    "fetch.fsckObjects=true",
    "fetch",
    "-q",
    "--no-tags",
    "--no-recurse-submodules",
    clone,
    `+refs/heads/${branch}:refs/heads/${branch}`,
  ]);
  if (!fetched.ok) return { ok: false, error: fetched.stderr };
  const tip = git(repoRoot, ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`]);
  return tip.ok ? { ok: true, sha: tip.stdout } : { ok: false, error: tip.stderr };
}
