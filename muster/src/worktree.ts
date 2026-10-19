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
export function fetchBranchBack(input: {
  repoRoot: string;
  clone: string;
  branch: string;
}): { ok: true } | { ok: false; error: string } {
  const { repoRoot, clone, branch } = input;
  const fetched = git(repoRoot, ["fetch", "-q", clone, `+${branch}:refs/heads/${branch}`]);
  return fetched.ok ? { ok: true } : { ok: false, error: fetched.stderr };
}
